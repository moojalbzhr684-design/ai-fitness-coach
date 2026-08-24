import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({ prisma: {
  authSession: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
} }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import {
  MemberAuthenticationError,
  authenticateMemberToken,
  createMemberSession,
  hashOpaqueToken,
  requireMutationCsrf,
  rotateMemberCsrfToken,
  revokeMemberSession,
} from "./member-session.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.authSession.create.mockResolvedValue({ id: "session-a", userId: "member-a", expiresAt: new Date("2026-09-24T00:00:00Z") });
  mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
});

describe("opaque member sessions", () => {
  it("creates a random opaque token and stores only its hash", async () => {
    const session = await createMemberSession("member-a", mocks.prisma as never, new Date("2026-08-24T00:00:00Z"));
    const stored = mocks.prisma.authSession.create.mock.calls[0]![0].data;
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(stored.tokenHash).toBe(hashOpaqueToken(session.token));
    expect(stored.tokenHash).not.toContain(session.token);
    expect(stored).not.toHaveProperty("systemRole");
  });

  it("loads roles and tenant memberships from the database, not the token", async () => {
    const user = { id: "member-a", systemRole: SystemRole.USER, gymMemberships: [{ gymId: "gym-a", role: GymRole.MEMBER }], identities: [], profile: {} };
    mocks.prisma.authSession.findUnique.mockResolvedValue({ id: "session-a", userId: "member-a", tokenHash: hashOpaqueToken("opaque-token-value-that-is-long-enough"), csrfTokenHash: hashOpaqueToken("csrf"), expiresAt: new Date("2026-09-01T00:00:00Z"), revokedAt: null, lastUsedAt: null, user });
    await expect(authenticateMemberToken("opaque-token-value-that-is-long-enough", new Date("2026-08-24T00:00:00Z"))).resolves.toMatchObject({ user });
  });

  it("rejects invalid, expired, and revoked tokens", async () => {
    mocks.prisma.authSession.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ expiresAt: new Date("2026-08-23T00:00:00Z"), revokedAt: null }).mockResolvedValueOnce({ expiresAt: new Date("2026-09-23T00:00:00Z"), revokedAt: new Date() });
    await expect(authenticateMemberToken("x".repeat(40))).resolves.toBeNull();
    await expect(authenticateMemberToken("y".repeat(40), new Date("2026-08-24T00:00:00Z"))).resolves.toBeNull();
    await expect(authenticateMemberToken("z".repeat(40), new Date("2026-08-24T00:00:00Z"))).resolves.toBeNull();
  });

  it("requires CSRF only for cookie mutations and revokes logout server-side", async () => {
    const auth = { mode: "cookie" as const, session: { csrfTokenHash: hashOpaqueToken("csrf-token") } };
    expect(() => requireMutationCsrf({ headers: { "x-csrf-token": "wrong" } } as never, auth as never)).toThrow(MemberAuthenticationError);
    expect(() => requireMutationCsrf({ headers: { "x-csrf-token": "csrf-token" } } as never, auth as never)).not.toThrow();
    expect(() => requireMutationCsrf({ headers: {} } as never, { ...auth, mode: "bearer" } as never)).not.toThrow();
    await revokeMemberSession("session-a");
    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith({ where: { id: "session-a", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("rotates a recoverable browser CSRF token without exposing the session token", async () => {
    const token = await rotateMemberCsrfToken("session-a");
    expect(token).toMatch(/^[A-Za-z0-9_-]{24,}$/);
    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "session-a", revokedAt: null }),
      data: { csrfTokenHash: hashOpaqueToken(token) },
    }));
  });
});
