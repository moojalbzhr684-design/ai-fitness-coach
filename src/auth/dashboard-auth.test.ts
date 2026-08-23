import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, MembershipStatus, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({ prisma: {
  user: { findUnique: vi.fn() },
  gymMembership: { findFirst: vi.fn() },
  trainerAssignment: { findUnique: vi.fn() },
} }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import {
  DashboardAuthorizationError,
  getDashboardDestinations,
  requireAdminActor,
  requireTrainerMemberAccess,
  resolveDashboardGym,
} from "./dashboard-auth.js";

function actor(role?: GymRole, gymId = "gym-a", systemRole: SystemRole = SystemRole.USER) {
  return {
    id: "actor",
    firstName: "Staff",
    systemRole,
    gymMemberships: role ? [{ gymId, role, status: MembershipStatus.ACTIVE, gym: { id: gymId, name: gymId, settings: null } }] : [],
  };
}

beforeEach(() => vi.clearAllMocks());

describe("dashboard role routing and direct URL authorization", () => {
  it("allows only a database-backed super admin into global routes", async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce(actor(undefined, "gym-a", SystemRole.SUPER_ADMIN)).mockResolvedValueOnce(actor());
    await expect(requireAdminActor("admin")).resolves.toMatchObject({ systemRole: SystemRole.SUPER_ADMIN });
    await expect(requireAdminActor("member")).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<DashboardAuthorizationError>);
  });

  it("requires an explicit gym when the owner has multiple tenants", async () => {
    const value = actor(GymRole.OWNER);
    value.gymMemberships.push({ gymId: "gym-b", role: GymRole.OWNER, status: MembershipStatus.ACTIVE, gym: { id: "gym-b", name: "B", settings: null } });
    mocks.prisma.user.findUnique.mockResolvedValue(value);
    await expect(resolveDashboardGym({ actorUserId: "owner", role: GymRole.OWNER })).resolves.toMatchObject({ membership: null, selectionRequired: true });
  });

  it("blocks a forged foreign gym selection", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor(GymRole.OWNER, "gym-a"));
    await expect(resolveDashboardGym({ actorUserId: "owner-a", role: GymRole.OWNER, requestedGymId: "gym-b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires an exact trainer assignment for member detail URLs", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor(GymRole.TRAINER));
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ id: "member-membership" });
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValueOnce({ id: "assignment" }).mockResolvedValueOnce(null);
    await expect(requireTrainerMemberAccess("trainer-a", "gym-a", "member-a")).resolves.toMatchObject({ id: "assignment" });
    await expect(requireTrainerMemberAccess("trainer-a", "gym-a", "member-b")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not create staff destinations for a member", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor(GymRole.MEMBER));
    await expect(getDashboardDestinations("member")).resolves.toMatchObject({ destinations: [] });
  });
});
