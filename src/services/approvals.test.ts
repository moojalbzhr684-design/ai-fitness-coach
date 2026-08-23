import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalStatus, ApprovalType, GymRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const tx = {
    approvalRequest: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    nutritionPlan: { findFirst: vi.fn() },
    agentDecision: { update: vi.fn() },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
  };
  return {
    canReviewApproval: vi.fn(),
    getActiveGymMembership: vi.fn(),
    isSuperAdmin: vi.fn(),
    prepareNutritionPlanVersion: vi.fn(),
    createPreparedNutritionPlanVersion: vi.fn(),
    prisma: {
      approvalRequest: { findUnique: vi.fn(), findMany: vi.fn() },
      agentDecision: { findUnique: vi.fn() },
      gymSettings: { findUnique: vi.fn() },
      trainerAssignment: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
    },
    tx,
  };
});
vi.mock("../auth/permissions.js", () => ({
  canReviewApproval: mocks.canReviewApproval,
  getActiveGymMembership: mocks.getActiveGymMembership,
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("./nutrition-plans.js", () => ({
  prepareNutritionPlanVersion: mocks.prepareNutritionPlanVersion,
  createPreparedNutritionPlanVersion: mocks.createPreparedNutritionPlanVersion,
}));

import {
  ApprovalServiceError,
  approveRequest,
  createApprovalForAgentDecision,
  rejectRequest,
} from "./approvals.js";

const future = new Date(Date.now() + 86_400_000);
const pendingNutrition = {
  id: "request-a",
  reference: "safe123",
  gymId: "gym-a",
  memberUserId: "member-a",
  trainerUserId: "trainer-a",
  agentDecisionId: "decision-a",
  type: ApprovalType.NUTRITION_ADJUSTMENT,
  status: ApprovalStatus.PENDING,
  requestedChange: { calories: 2_050, delta: -150 },
  currentValue: { calories: 2_200 },
  reason: "Stable trend and high adherence",
  expiresAt: future,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.canReviewApproval.mockResolvedValue(true);
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.getActiveGymMembership.mockResolvedValue({ role: GymRole.TRAINER });
});

describe("approval creation and authorization", () => {
  it("creates exactly one eligible nutrition approval for an AgentDecision", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(null);
    mocks.prisma.agentDecision.findUnique.mockResolvedValue({
      id: "decision-a",
      userId: "member-a",
      gymId: "gym-a",
      decisionType: "WEEKLY_PROGRESS_REVIEW",
      oldValue: { calories: 2_200 },
      newValue: { recommendedCalories: 2_050, recommendedCaloriesDelta: -150 },
      reason: "Stable trend and high adherence",
      requiresCoachApproval: true,
      approvedAt: null,
      rejectedAt: null,
    });
    mocks.prisma.gymSettings.findUnique.mockResolvedValue({ requireTrainerApprovalForNutritionChanges: true });
    mocks.prisma.trainerAssignment.findFirst.mockResolvedValue({ trainerUserId: "trainer-a" });
    mocks.tx.approvalRequest.create.mockImplementation(async ({ data }) => ({ id: "request-a", ...data }));
    const result = await createApprovalForAgentDecision("decision-a");
    expect(result).toEqual(expect.objectContaining({ type: ApprovalType.NUTRITION_ADJUSTMENT, trainerUserId: "trainer-a" }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "APPROVAL_REQUEST_CREATED", gymId: "gym-a" }),
    });
  });

  it("returns the existing request instead of creating a duplicate", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    await expect(createApprovalForAgentDecision("decision-a")).resolves.toBe(pendingNutrition);
    expect(mocks.prisma.agentDecision.findUnique).not.toHaveBeenCalled();
  });

  it("stores workout adjustment approval foundations without rewriting a program", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(null);
    mocks.prisma.agentDecision.findUnique.mockResolvedValue({
      id: "decision-workout",
      userId: "member-a",
      gymId: "gym-a",
      decisionType: "WORKOUT_LOAD_REVIEW",
      oldValue: { split: "FULL_BODY" },
      newValue: { proposedSplit: "UPPER_LOWER" },
      reason: "Training frequency changed",
      requiresCoachApproval: true,
      approvedAt: null,
      rejectedAt: null,
    });
    mocks.prisma.gymSettings.findUnique.mockResolvedValue({ requireTrainerApprovalForWorkoutChanges: true });
    mocks.prisma.trainerAssignment.findFirst.mockResolvedValue(null);
    mocks.tx.approvalRequest.create.mockImplementation(async ({ data }) => ({ id: "request-workout", ...data }));
    const result = await createApprovalForAgentDecision("decision-workout");
    expect(result).toEqual(expect.objectContaining({ type: ApprovalType.WORKOUT_ADJUSTMENT, trainerUserId: null }));
    expect(mocks.createPreparedNutritionPlanVersion).not.toHaveBeenCalled();
  });

  it("blocks a random trainer", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.canReviewApproval.mockResolvedValue(false);
    await expect(approveRequest("trainer-b", "request-a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<ApprovalServiceError>);
  });

  it.each([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])("prevents replay from %s", async (status) => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue({ ...pendingNutrition, status });
    await expect(approveRequest("trainer-a", "request-a")).rejects.toMatchObject({ code: "NOT_PENDING" });
  });

  it("expires a stale request without applying it", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue({
      ...pendingNutrition,
      expiresAt: new Date(Date.now() - 1_000),
    });
    mocks.tx.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    await expect(approveRequest("trainer-a", "request-a")).rejects.toMatchObject({ code: "EXPIRED" });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "APPROVAL_EXPIRED" }),
    });
    expect(mocks.prepareNutritionPlanVersion).not.toHaveBeenCalled();
  });
});

describe("approval application", () => {
  it("safely applies a valid calorie adjustment and creates a new plan version", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.tx.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.tx.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.nutritionPlan.findFirst.mockResolvedValue({ id: "old-plan", target: { calories: 2_200 } });
    mocks.prepareNutritionPlanVersion.mockResolvedValue({ userId: "member-a", gymId: "gym-a" });
    mocks.createPreparedNutritionPlanVersion.mockResolvedValue({ id: "new-plan" });
    const result = await approveRequest("trainer-a", "request-a");
    expect(result).toEqual({ approvalRequestId: "request-a", nutritionPlanId: "new-plan", appliedCalories: 2_050 });
    expect(mocks.prepareNutritionPlanVersion).toHaveBeenCalledWith("member-a", 2_050, "gym-a");
    expect(mocks.createPreparedNutritionPlanVersion).toHaveBeenCalledOnce();
    expect(mocks.tx.agentDecision.update).toHaveBeenCalledWith({ where: { id: "decision-a" }, data: { approvedAt: expect.any(Date) } });
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ action: "NUTRITION_ADJUSTMENT_APPLIED" })]),
    });
  });

  it("blocks stale current calories and preserves the old plan", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.tx.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.tx.nutritionPlan.findFirst.mockResolvedValue({ id: "newer-plan", target: { calories: 2_100 } });
    mocks.prepareNutritionPlanVersion.mockResolvedValue({ userId: "member-a", gymId: "gym-a" });
    await expect(approveRequest("trainer-a", "request-a")).rejects.toMatchObject({ code: "STALE_CURRENT_VALUE" });
    expect(mocks.createPreparedNutritionPlanVersion).not.toHaveBeenCalled();
    expect(mocks.tx.approvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it("reruns calorie safety guardrails before opening a transaction", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.prepareNutritionPlanVersion.mockRejectedValue(new RangeError("below safety floor"));
    await expect(approveRequest("trainer-a", "request-a")).rejects.toMatchObject({ code: "SAFETY_FAILED" });
    expect(mocks.createPreparedNutritionPlanVersion).not.toHaveBeenCalled();
  });

  it("rejects without modifying the nutrition plan", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue(pendingNutrition);
    mocks.tx.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    const result = await rejectRequest("trainer-a", "request-a", "Needs another week");
    expect(result.status).toBe(ApprovalStatus.REJECTED);
    expect(mocks.createPreparedNutritionPlanVersion).not.toHaveBeenCalled();
    expect(mocks.tx.agentDecision.update).toHaveBeenCalledWith({ where: { id: "decision-a" }, data: { rejectedAt: expect.any(Date) } });
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ action: "NUTRITION_ADJUSTMENT_REJECTED" })]),
    });
  });
});
