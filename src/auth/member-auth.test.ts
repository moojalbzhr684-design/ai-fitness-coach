import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthChallengePurpose } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const prisma = {
    authChallenge: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    userIdentity: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    user: { create: vi.fn() },
    authSession: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { env } from "../config/env.js";
import { authRateLimiter } from "./rate-limit.js";
import { requestEmailLoginCode, verifyEmailLoginCode } from "./member-auth.js";

let deliveredCode = "";
const provider = { sendLoginCode: vi.fn(async ({ code }: { code: string }) => { deliveredCode = code; }) };

beforeEach(() => {
  vi.clearAllMocks();
  authRateLimiter.reset();
  deliveredCode = "";
  mocks.prisma.$transaction.mockImplementation(async (callback: (database: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  mocks.prisma.authChallenge.deleteMany.mockResolvedValue({ count: 1 });
  mocks.prisma.authChallenge.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.userIdentity.findUnique.mockResolvedValue(null);
  mocks.prisma.user.create.mockResolvedValue({ id: "new-user" });
  mocks.prisma.userIdentity.create.mockResolvedValue({ id: "email-identity" });
  mocks.prisma.authSession.create.mockResolvedValue({ id: "session-a", userId: "new-user", expiresAt: new Date("2026-09-01T00:00:00Z") });
  mocks.prisma.authChallenge.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "challenge-a", expiresAt: data.expiresAt, ...data }));
});

async function requested(now = new Date("2026-08-24T10:00:00Z")) {
  const result = await requestEmailLoginCode({ email: "Member@Example.com", ip: "127.0.0.1", provider, now });
  const data = mocks.prisma.authChallenge.create.mock.calls[0]![0].data;
  return { result, challenge: { ...data, id: result.challengeId, attemptCount: 0, usedAt: null, createdAt: now } };
}

describe("email OTP authentication", () => {
  it("creates a generic challenge, stores only a hash, and verifies into an opaque session", async () => {
    const { result, challenge } = await requested();
    expect(result.message).not.toContain("account");
    expect(deliveredCode).toMatch(/^\d{6}$/);
    expect(challenge.codeHash).not.toContain(deliveredCode);
    mocks.prisma.authChallenge.findUnique.mockResolvedValue(challenge);
    const verified = await verifyEmailLoginCode({ email: "member@example.com", challengeId: result.challengeId, code: deliveredCode, now: new Date("2026-08-24T10:01:00Z") });
    expect(verified).toMatchObject({ linked: false, userId: "new-user", session: { id: "session-a" } });
    expect(verified.linked || verified.session.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(mocks.prisma.authSession.create.mock.calls[0]![0].data.tokenHash).not.toBe(verified.linked ? "" : verified.session.token);
    expect(mocks.prisma.userIdentity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isVerified: true, providerSubject: "member@example.com" }) }));
  });

  it("rejects a wrong code and increments attempts", async () => {
    const { result, challenge } = await requested();
    mocks.prisma.authChallenge.findUnique.mockResolvedValue(challenge);
    const wrongCode = deliveredCode === "999999" ? "888888" : "999999";
    await expect(verifyEmailLoginCode({ email: "member@example.com", challengeId: result.challengeId, code: wrongCode, now: new Date("2026-08-24T10:01:00Z") })).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    expect(mocks.prisma.authChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { attemptCount: { increment: 1 } } }));
    expect(mocks.prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("rejects expired, reused, and attempt-exhausted challenges", async () => {
    const { result, challenge } = await requested();
    for (const changed of [
      { ...challenge, expiresAt: new Date("2026-08-24T09:00:00Z") },
      { ...challenge, usedAt: new Date("2026-08-24T10:01:00Z") },
      { ...challenge, attemptCount: env.AUTH_OTP_MAX_ATTEMPTS },
    ]) {
      mocks.prisma.authChallenge.findUnique.mockResolvedValueOnce(changed);
      await expect(verifyEmailLoginCode({ email: "member@example.com", challengeId: result.challengeId, code: deliveredCode, now: new Date("2026-08-24T10:02:00Z") })).rejects.toBeTruthy();
    }
    expect(mocks.prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("rate-limits repeated OTP requests without user enumeration queries", async () => {
    for (let index = 0; index < env.AUTH_OTP_REQUESTS_PER_WINDOW; index += 1) {
      await requestEmailLoginCode({ email: "nobody@example.com", provider, now: new Date("2026-08-24T10:00:00Z") });
    }
    await expect(requestEmailLoginCode({ email: "nobody@example.com", provider, now: new Date("2026-08-24T10:00:01Z") })).rejects.toMatchObject({ name: "RateLimitError" });
    expect(mocks.prisma.userIdentity.findUnique).not.toHaveBeenCalled();
  });

  it("links only a verified challenge tied to the authenticated user and never creates a name-based duplicate", async () => {
    const now = new Date("2026-08-24T10:00:00Z");
    await requestEmailLoginCode({ email: "linked@example.com", purpose: AuthChallengePurpose.LINK_IDENTITY, linkUserId: "telegram-user", provider, now });
    const challenge = { ...mocks.prisma.authChallenge.create.mock.calls[0]![0].data, id: "challenge-a", attemptCount: 0, usedAt: null };
    mocks.prisma.authChallenge.findUnique.mockResolvedValue(challenge);
    await expect(verifyEmailLoginCode({ email: "linked@example.com", challengeId: "challenge-a", code: deliveredCode, expectedPurpose: AuthChallengePurpose.LINK_IDENTITY, authenticatedUserId: "other-user", now })).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    const linked = await verifyEmailLoginCode({ email: "linked@example.com", challengeId: "challenge-a", code: deliveredCode, expectedPurpose: AuthChallengePurpose.LINK_IDENTITY, authenticatedUserId: "telegram-user", now });
    expect(linked).toEqual({ linked: true, userId: "telegram-user" });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
    expect(mocks.prisma.authSession.create).not.toHaveBeenCalled();
  });
});
