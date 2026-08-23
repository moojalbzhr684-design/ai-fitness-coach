import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalStatus, GymRole, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    gymMembership: { findFirst: vi.fn() },
    trainerAssignment: { findUnique: vi.fn() },
    approvalRequest: { findUnique: vi.fn() },
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { canManageGym, canManageMember, canReviewApproval } from "./permissions.js";

beforeEach(() => vi.clearAllMocks());

describe("tenant authorization", () => {
  it("allows a super admin to manage any gym", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.SUPER_ADMIN });
    await expect(canManageGym("admin", "gym-b")).resolves.toBe(true);
  });

  it("allows an owner to manage their own gym", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ role: GymRole.OWNER });
    await expect(canManageGym("owner-a", "gym-a")).resolves.toBe(true);
  });

  it.each([GymRole.TRAINER, GymRole.MEMBER])("blocks a %s from gym settings", async (role) => {
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ role });
    await expect(canManageGym("actor", "gym-a")).resolves.toBe(false);
  });

  it("blocks an owner of Gym A from managing Gym B", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.gymMembership.findFirst.mockResolvedValue(null);
    await expect(canManageGym("owner-a", "gym-b")).resolves.toBe(false);
  });

  it("allows an assigned same-gym trainer to manage coaching data", async () => {
    mocks.prisma.gymMembership.findFirst
      .mockResolvedValueOnce({ role: GymRole.MEMBER })
      .mockResolvedValueOnce({ role: GymRole.TRAINER });
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValue({ id: "assignment-a" });
    await expect(canManageMember("trainer-a", "gym-a", "member-a")).resolves.toBe(true);
  });

  it("blocks an unassigned trainer from another tenant's member", async () => {
    mocks.prisma.gymMembership.findFirst
      .mockResolvedValueOnce({ role: GymRole.MEMBER })
      .mockResolvedValueOnce(null);
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    await expect(canManageMember("trainer-b", "gym-a", "member-a")).resolves.toBe(false);
  });

  it("allows only the assigned trainer to review a request", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue({
      id: "request-a", gymId: "gym-a", trainerUserId: "trainer-a", status: ApprovalStatus.PENDING,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ role: GymRole.TRAINER });
    await expect(canReviewApproval("trainer-a", "request-a")).resolves.toBe(true);
    await expect(canReviewApproval("trainer-b", "request-a")).resolves.toBe(false);
  });

  it("allows a same-gym owner to review all requests in scope", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue({
      id: "request-a", gymId: "gym-a", trainerUserId: "trainer-a", status: ApprovalStatus.PENDING,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ role: GymRole.OWNER });
    await expect(canReviewApproval("owner-a", "request-a")).resolves.toBe(true);
  });

  it("allows a super admin to review globally", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue({
      id: "request-b", gymId: "gym-b", trainerUserId: null, status: ApprovalStatus.PENDING,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.SUPER_ADMIN });
    await expect(canReviewApproval("admin", "request-b")).resolves.toBe(true);
  });

  it("blocks a member and any already-reviewed request", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValueOnce({
      id: "request-a", gymId: "gym-a", trainerUserId: "trainer-a", status: ApprovalStatus.PENDING,
    }).mockResolvedValueOnce({
      id: "request-a", gymId: "gym-a", trainerUserId: "trainer-a", status: ApprovalStatus.APPROVED,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ systemRole: SystemRole.USER });
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ role: GymRole.MEMBER });
    await expect(canReviewApproval("member-a", "request-a")).resolves.toBe(false);
    await expect(canReviewApproval("trainer-a", "request-a")).resolves.toBe(false);
  });
});
