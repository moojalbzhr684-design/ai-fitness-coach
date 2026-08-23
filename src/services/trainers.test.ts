import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const tx = {
    trainerAssignment: { updateMany: vi.fn(), create: vi.fn(), delete: vi.fn() },
    trainerProfile: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    canManageGym: vi.fn(),
    prisma: {
      gymMembership: { findFirst: vi.fn() },
      trainerAssignment: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      user: { findUnique: vi.fn() },
      trainerPreferences: { upsert: vi.fn() },
      $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
    },
    tx,
  };
});
vi.mock("../auth/permissions.js", () => ({ canManageGym: mocks.canManageGym }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import {
  assignTrainerToMember,
  getTrainerMembers,
  removeTrainerFromMember,
  TrainerServiceError,
} from "./trainers.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.canManageGym.mockResolvedValue(true);
});

describe("trainer assignment", () => {
  it("allows an owner to assign a valid same-gym trainer and member", async () => {
    mocks.prisma.gymMembership.findFirst
      .mockResolvedValueOnce({ role: GymRole.TRAINER })
      .mockResolvedValueOnce({ role: GymRole.MEMBER });
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValue(null);
    mocks.tx.trainerAssignment.create.mockResolvedValue({ id: "assignment-a" });
    const result = await assignTrainerToMember("owner-a", "gym-a", "trainer-a", "member-a");
    expect(result).toEqual({ id: "assignment-a" });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "TRAINER_ASSIGNED", gymId: "gym-a" }),
    });
  });

  it("blocks a trainer from another gym", async () => {
    mocks.prisma.gymMembership.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: GymRole.MEMBER });
    await expect(assignTrainerToMember("owner-a", "gym-a", "trainer-b", "member-a")).rejects.toMatchObject({
      code: "INVALID_TRAINER",
    } satisfies Partial<TrainerServiceError>);
  });

  it("blocks a member from another gym", async () => {
    mocks.prisma.gymMembership.findFirst.mockResolvedValueOnce({ role: GymRole.TRAINER }).mockResolvedValueOnce(null);
    await expect(assignTrainerToMember("owner-a", "gym-a", "trainer-a", "member-b")).rejects.toMatchObject({
      code: "INVALID_MEMBER",
    } satisfies Partial<TrainerServiceError>);
  });

  it("prevents duplicate assignments", async () => {
    mocks.prisma.gymMembership.findFirst
      .mockResolvedValueOnce({ role: GymRole.TRAINER })
      .mockResolvedValueOnce({ role: GymRole.MEMBER });
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValue({ id: "existing" });
    await expect(assignTrainerToMember("owner-a", "gym-a", "trainer-a", "member-a")).rejects.toMatchObject({
      code: "DUPLICATE_ASSIGNMENT",
    } satisfies Partial<TrainerServiceError>);
  });

  it("prevents a trainer from being assigned to themselves", async () => {
    await expect(assignTrainerToMember("owner-a", "gym-a", "same-user", "same-user")).rejects.toMatchObject({
      code: "INVALID_MEMBER",
    } satisfies Partial<TrainerServiceError>);
    expect(mocks.prisma.gymMembership.findFirst).not.toHaveBeenCalled();
  });

  it("does not allow a trainer to claim members", async () => {
    mocks.canManageGym.mockResolvedValue(false);
    await expect(assignTrainerToMember("trainer-a", "gym-a", "trainer-a", "member-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TrainerServiceError>);
  });

  it("removes a scoped assignment and audits the privileged action", async () => {
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValue({ id: "assignment-a" });
    mocks.tx.trainerAssignment.delete.mockResolvedValue({ id: "assignment-a" });
    await removeTrainerFromMember("owner-a", "gym-a", "trainer-a", "member-a");
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "TRAINER_UNASSIGNED", gymId: "gym-a" }),
    });
  });

  it("blocks a member from using trainer member queries", async () => {
    mocks.prisma.gymMembership.findFirst.mockResolvedValue({ role: GymRole.MEMBER });
    await expect(getTrainerMembers("member-a", "gym-a")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.prisma.trainerAssignment.findMany).not.toHaveBeenCalled();
  });
});
