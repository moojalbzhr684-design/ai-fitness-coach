import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, MembershipStatus, SystemRole } from "../../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({ prisma: {
  user: { findUnique: vi.fn() },
  gymMembership: { findMany: vi.fn(), count: vi.fn() },
  trainerAssignment: { findMany: vi.fn(), count: vi.fn() },
} }));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { getGymMembers } from "./gym.js";
import { getTrainerMembersDashboard } from "./trainer.js";

function scopedActor(role: GymRole, gymId = "gym-a") {
  return { id: "actor", systemRole: SystemRole.USER, gymMemberships: [{ gymId, role, status: MembershipStatus.ACTIVE, gym: { id: gymId, name: gymId, isActive: true, settings: null } }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.gymMembership.findMany.mockResolvedValue([]);
  mocks.prisma.gymMembership.count.mockResolvedValue(0);
  mocks.prisma.trainerAssignment.findMany.mockResolvedValue([]);
  mocks.prisma.trainerAssignment.count.mockResolvedValue(0);
});

describe("tenant-scoped dashboard collections", () => {
  it("pins owner member queries to the authorized gym", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(scopedActor(GymRole.OWNER));
    await getGymMembers("owner-a", "gym-a", { page: 2, pageSize: 25, search: "sam" });
    expect(mocks.prisma.gymMembership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ gymId: "gym-a", role: GymRole.MEMBER, status: MembershipStatus.ACTIVE }),
      skip: 25,
      take: 25,
    }));
  });

  it("never runs a Gym B member query for a Gym A owner", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(scopedActor(GymRole.OWNER, "gym-a"));
    await expect(getGymMembers("owner-a", "gym-b", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.prisma.gymMembership.findMany).not.toHaveBeenCalled();
  });

  it("pins trainer collections to actor, gym and assignment rows", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(scopedActor(GymRole.TRAINER));
    await getTrainerMembersDashboard("trainer-a", "gym-a", { page: 1, pageSize: 25 });
    expect(mocks.prisma.trainerAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ gymId: "gym-a", trainerUserId: "trainer-a" }),
      skip: 0,
      take: 25,
    }));
  });
});
