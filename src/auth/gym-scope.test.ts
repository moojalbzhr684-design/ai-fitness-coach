import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  prisma: { gymMembership: { findMany: vi.fn() } },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { GymScopeError, resolveGymMembership } from "./gym-scope.js";

beforeEach(() => vi.clearAllMocks());

describe("multi-gym context selection", () => {
  it("uses the only active scoped membership", async () => {
    mocks.prisma.gymMembership.findMany.mockResolvedValue([{ id: "membership-a", gymId: "gym-a" }]);
    await expect(resolveGymMembership({ userId: "trainer-a", roles: [GymRole.TRAINER] })).resolves.toEqual(expect.objectContaining({
      membership: expect.objectContaining({ gymId: "gym-a" }),
      selectionRequired: false,
    }));
  });

  it("requires explicit selection when multiple tenant memberships exist", async () => {
    mocks.prisma.gymMembership.findMany.mockResolvedValue([
      { id: "membership-a", gymId: "gym-a" },
      { id: "membership-b", gymId: "gym-b" },
    ]);
    await expect(resolveGymMembership({ userId: "owner" })).resolves.toEqual(expect.objectContaining({
      membership: null,
      selectionRequired: true,
    }));
  });

  it("revalidates a selected membership against actor scope", async () => {
    mocks.prisma.gymMembership.findMany.mockResolvedValue([{ id: "membership-a", gymId: "gym-a" }]);
    await expect(resolveGymMembership({ userId: "owner-a", membershipId: "membership-b" })).rejects.toMatchObject({
      code: "FORBIDDEN_GYM",
    } satisfies Partial<GymScopeError>);
  });

  it("fails closed when no active membership exists", async () => {
    mocks.prisma.gymMembership.findMany.mockResolvedValue([]);
    await expect(resolveGymMembership({ userId: "outsider" })).rejects.toMatchObject({ code: "NO_GYM" });
  });
});
