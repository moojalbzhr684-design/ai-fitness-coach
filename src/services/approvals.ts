import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  ApprovalStatus,
  ApprovalType,
  GymRole,
  NutritionPlanStatus,
  Prisma,
} from "../generated/prisma/client.js";
import { canReviewApproval, getActiveGymMembership, isSuperAdmin } from "../auth/permissions.js";
import { prisma } from "../lib/prisma.js";
import { MAX_CALORIE_ADJUSTMENT } from "../progress/rules.js";
import {
  createPreparedNutritionPlanVersion,
  prepareNutritionPlanVersion,
} from "./nutrition-plans.js";

export const APPROVAL_EXPIRATION_DAYS = 14;
const DAY_MS = 86_400_000;

const currentCaloriesSchema = z.object({ calories: z.number().int().positive() }).strict();
const calorieChangeSchema = z.object({
  calories: z.number().int().positive(),
  delta: z.number().int().min(-MAX_CALORIE_ADJUSTMENT).max(MAX_CALORIE_ADJUSTMENT).refine((value) => value !== 0),
}).strict();

export class ApprovalServiceError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "NOT_ELIGIBLE"
      | "FORBIDDEN"
      | "NOT_PENDING"
      | "EXPIRED"
      | "STALE_CURRENT_VALUE"
      | "INVALID_CHANGE"
      | "SAFETY_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ApprovalServiceError";
  }
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function createApprovalForAgentDecision(agentDecisionId: string) {
  const existing = await prisma.approvalRequest.findUnique({ where: { agentDecisionId } });
  if (existing) return existing;
  const decision = await prisma.agentDecision.findUnique({ where: { id: agentDecisionId } });
  if (!decision) throw new ApprovalServiceError("NOT_FOUND", "Agent decision not found");
  if (!decision.requiresCoachApproval || !decision.gymId || decision.approvedAt || decision.rejectedAt) {
    throw new ApprovalServiceError("NOT_ELIGIBLE", "Agent decision is not eligible for gym approval");
  }
  const settings = await prisma.gymSettings.findUnique({ where: { gymId: decision.gymId } });
  const oldValue = jsonObject(decision.oldValue);
  const newValue = jsonObject(decision.newValue);
  const currentCalories = oldValue?.calories;
  const calories = newValue?.recommendedCalories;
  const delta = newValue?.recommendedCaloriesDelta;
  let type: ApprovalType = ApprovalType.OTHER;
  let requestedChange: Record<string, unknown> = { decisionType: decision.decisionType };
  let currentValue: Record<string, unknown> | null = oldValue;
  if (typeof currentCalories === "number" && typeof calories === "number" && typeof delta === "number" && delta !== 0) {
    if (settings && !settings.requireTrainerApprovalForNutritionChanges) {
      throw new ApprovalServiceError("NOT_ELIGIBLE", "Gym policy does not require nutrition approval");
    }
    type = ApprovalType.NUTRITION_ADJUSTMENT;
    requestedChange = calorieChangeSchema.parse({ calories, delta });
    currentValue = currentCaloriesSchema.parse({ calories: currentCalories });
  } else if (decision.decisionType.includes("WORKOUT")) {
    if (settings && !settings.requireTrainerApprovalForWorkoutChanges) {
      throw new ApprovalServiceError("NOT_ELIGIBLE", "Gym policy does not require workout approval");
    }
    type = ApprovalType.WORKOUT_ADJUSTMENT;
    requestedChange = newValue ?? requestedChange;
  } else {
    throw new ApprovalServiceError("NOT_ELIGIBLE", "Decision contains no supported change");
  }
  const primary = await prisma.trainerAssignment.findFirst({
    where: { gymId: decision.gymId, memberUserId: decision.userId, isPrimary: true },
    orderBy: { createdAt: "asc" },
  });
  try {
    return await prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as typeof prisma;
      const request = await transaction.approvalRequest.create({
        data: {
          reference: randomBytes(12).toString("hex"),
          gymId: decision.gymId!,
          memberUserId: decision.userId,
          trainerUserId: primary?.trainerUserId ?? null,
          agentDecisionId: decision.id,
          type,
          requestedChange: requestedChange as Prisma.InputJsonObject,
          currentValue: currentValue ? currentValue as Prisma.InputJsonObject : Prisma.JsonNull,
          reason: decision.reason,
          expiresAt: new Date(Date.now() + APPROVAL_EXPIRATION_DAYS * DAY_MS),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: decision.userId,
          gymId: decision.gymId,
          action: "APPROVAL_REQUEST_CREATED",
          targetType: "ApprovalRequest",
          targetId: request.id,
          metadata: { type, assigned: Boolean(primary) },
        },
      });
      return request;
    });
  } catch (error) {
    const concurrent = await prisma.approvalRequest.findUnique({ where: { agentDecisionId } });
    if (concurrent) return concurrent;
    throw error;
  }
}

async function expireScopedRequests(actorUserId: string, gymId: string): Promise<void> {
  const expired = await prisma.approvalRequest.findMany({
    where: { gymId, status: ApprovalStatus.PENDING, expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  if (expired.length === 0) return;
  await prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.approvalRequest.updateMany({
      where: { id: { in: expired.map(({ id }) => id) }, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.EXPIRED },
    });
    await transaction.auditLog.createMany({
      data: expired.map(({ id }) => ({
        actorUserId,
        gymId,
        action: "APPROVAL_EXPIRED",
        targetType: "ApprovalRequest",
        targetId: id,
      })),
    });
  });
}

export async function getPendingApprovalsForTrainer(actorUserId: string, gymId: string) {
  const superAdmin = await isSuperAdmin(actorUserId);
  const membership = await getActiveGymMembership(actorUserId, gymId);
  if (!superAdmin && membership?.role !== GymRole.OWNER && membership?.role !== GymRole.TRAINER) {
    throw new ApprovalServiceError("FORBIDDEN", "Trainer access is unavailable for this gym");
  }
  await expireScopedRequests(actorUserId, gymId);
  return prisma.approvalRequest.findMany({
    where: {
      gymId,
      status: ApprovalStatus.PENDING,
      ...(!superAdmin && membership?.role === GymRole.TRAINER ? { trainerUserId: actorUserId } : {}),
    },
    include: {
      member: { select: { firstName: true, telegramUsername: true } },
      gym: { include: { settings: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getPendingApprovalsForMember(memberUserId: string, gymId?: string) {
  return prisma.approvalRequest.findMany({
    where: {
      memberUserId,
      status: ApprovalStatus.PENDING,
      expiresAt: { gt: new Date() },
      ...(gymId ? { gymId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, reference: true, gymId: true, type: true, status: true, reason: true, createdAt: true, expiresAt: true },
  });
}

export async function requestStructuredPlanReview(input: {
  memberUserId: string;
  gymId: string;
  scope: "NUTRITION" | "WORKOUT" | "BOTH";
  notes?: string;
}) {
  const notes = input.notes?.trim();
  if (notes && notes.length > 500) throw new ApprovalServiceError("INVALID_CHANGE", "Review notes are too long");
  const membership = await getActiveGymMembership(input.memberUserId, input.gymId);
  if (membership?.role !== GymRole.MEMBER) {
    throw new ApprovalServiceError("FORBIDDEN", "Member is not active in this gym");
  }
  const reason = `MEMBER_PLAN_REVIEW:${input.scope}:${notes ?? "NO_NOTES"}`;
  const existing = await prisma.approvalRequest.findFirst({
    where: {
      memberUserId: input.memberUserId,
      gymId: input.gymId,
      type: ApprovalType.OTHER,
      status: ApprovalStatus.PENDING,
      reason,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const trainer = await prisma.trainerAssignment.findFirst({
    where: { memberUserId: input.memberUserId, gymId: input.gymId, isPrimary: true },
    orderBy: { createdAt: "asc" },
  });
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const request = await transaction.approvalRequest.create({
      data: {
        reference: randomBytes(12).toString("hex"),
        gymId: input.gymId,
        memberUserId: input.memberUserId,
        trainerUserId: trainer?.trainerUserId ?? null,
        type: ApprovalType.OTHER,
        requestedChange: { kind: "PLAN_REVIEW_REQUEST", scope: input.scope, notes: notes ?? null },
        reason,
        expiresAt: new Date(Date.now() + APPROVAL_EXPIRATION_DAYS * DAY_MS),
      },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: input.memberUserId,
        gymId: input.gymId,
        action: "PLAN_REVIEW_REQUESTED",
        targetType: "ApprovalRequest",
        targetId: request.id,
        metadata: { scope: input.scope, assigned: Boolean(trainer) },
      },
    });
    return request;
  });
}

async function expireIfNeeded(actorUserId: string, requestId: string): Promise<boolean> {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== ApprovalStatus.PENDING || !request.expiresAt || request.expiresAt > new Date()) return false;
  if (!await canReviewApproval(actorUserId, request.id)) {
    throw new ApprovalServiceError("FORBIDDEN", "Actor cannot review this approval");
  }
  await prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.approvalRequest.updateMany({
      where: { id: request.id, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.EXPIRED },
    });
    await transaction.auditLog.create({
      data: { actorUserId, gymId: request.gymId, action: "APPROVAL_EXPIRED", targetType: "ApprovalRequest", targetId: request.id },
    });
  });
  return true;
}

export async function applyApprovedNutritionAdjustment(
  actorUserId: string,
  approvalRequestId: string,
  optionalNote?: string,
) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  if (!request) throw new ApprovalServiceError("NOT_FOUND", "Approval request not found");
  if (request.type !== ApprovalType.NUTRITION_ADJUSTMENT) {
    throw new ApprovalServiceError("INVALID_CHANGE", "Approval is not a nutrition adjustment");
  }
  if (request.status !== ApprovalStatus.PENDING) throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
  if (!await canReviewApproval(actorUserId, request.id)) {
    throw new ApprovalServiceError("FORBIDDEN", "Actor cannot review this approval");
  }
  const change = calorieChangeSchema.safeParse(request.requestedChange);
  const current = currentCaloriesSchema.safeParse(request.currentValue);
  if (!change.success || !current.success || current.data.calories + change.data.delta !== change.data.calories) {
    throw new ApprovalServiceError("INVALID_CHANGE", "Approval calorie payload is invalid");
  }
  let prepared;
  try {
    prepared = await prepareNutritionPlanVersion(request.memberUserId, change.data.calories, request.gymId);
  } catch (error) {
    throw new ApprovalServiceError("SAFETY_FAILED", error instanceof Error ? error.message : "Nutrition safety validation failed");
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const locked = await transaction.approvalRequest.findUnique({ where: { id: request.id } });
    if (!locked || locked.status !== ApprovalStatus.PENDING) {
      throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
    }
    if (locked.expiresAt && locked.expiresAt <= now) throw new ApprovalServiceError("EXPIRED", "Approval has expired");
    const activePlan = await transaction.nutritionPlan.findFirst({
      where: { userId: request.memberUserId, status: NutritionPlanStatus.ACTIVE },
      include: { target: true },
      orderBy: { startedAt: "desc" },
    });
    if (!activePlan || activePlan.target.calories !== current.data.calories) {
      throw new ApprovalServiceError("STALE_CURRENT_VALUE", "Nutrition target changed; regenerate the recommendation");
    }
    const created = await createPreparedNutritionPlanVersion(transaction, prepared, now);
    const updated = await transaction.approvalRequest.updateMany({
      where: { id: request.id, status: ApprovalStatus.PENDING },
      data: {
        status: ApprovalStatus.APPROVED,
        reviewedAt: now,
        reviewedByUserId: actorUserId,
        reviewNote: optionalNote?.trim() || null,
      },
    });
    if (updated.count !== 1) throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
    if (request.agentDecisionId) {
      await transaction.agentDecision.update({ where: { id: request.agentDecisionId }, data: { approvedAt: now } });
    }
    await transaction.auditLog.createMany({
      data: [
        "APPROVAL_APPROVED",
        "NUTRITION_ADJUSTMENT_APPROVED",
        "NUTRITION_PLAN_REGENERATED",
        "NUTRITION_ADJUSTMENT_APPLIED",
      ].map((action) => ({
        actorUserId,
        gymId: request.gymId,
        action,
        targetType: action === "NUTRITION_PLAN_REGENERATED" ? "NutritionPlan" : "ApprovalRequest",
        targetId: action === "NUTRITION_PLAN_REGENERATED" ? created.id : request.id,
        metadata: { memberUserId: request.memberUserId },
      })),
    });
    return { approvalRequestId: request.id, nutritionPlanId: created.id, appliedCalories: change.data.calories };
  });
}

export async function approveRequest(actorUserId: string, approvalRequestId: string, optionalNote?: string) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  if (!request) throw new ApprovalServiceError("NOT_FOUND", "Approval request not found");
  if (request.status !== ApprovalStatus.PENDING) throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
  if (await expireIfNeeded(actorUserId, request.id)) throw new ApprovalServiceError("EXPIRED", "Approval has expired");
  if (!await canReviewApproval(actorUserId, request.id)) throw new ApprovalServiceError("FORBIDDEN", "Actor cannot review this approval");
  if (request.type === ApprovalType.NUTRITION_ADJUSTMENT) {
    return applyApprovedNutritionAdjustment(actorUserId, request.id, optionalNote);
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const updated = await transaction.approvalRequest.updateMany({
      where: { id: request.id, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.APPROVED, reviewedAt: now, reviewedByUserId: actorUserId, reviewNote: optionalNote?.trim() || null },
    });
    if (updated.count !== 1) throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
    if (request.agentDecisionId) {
      await transaction.agentDecision.update({ where: { id: request.agentDecisionId }, data: { approvedAt: now } });
    }
    await transaction.auditLog.create({
      data: { actorUserId, gymId: request.gymId, action: "APPROVAL_APPROVED", targetType: "ApprovalRequest", targetId: request.id },
    });
    return { approvalRequestId: request.id, applied: false };
  });
}

export async function rejectRequest(actorUserId: string, approvalRequestId: string, optionalNote?: string) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } });
  if (!request) throw new ApprovalServiceError("NOT_FOUND", "Approval request not found");
  if (request.status !== ApprovalStatus.PENDING) throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
  if (await expireIfNeeded(actorUserId, request.id)) throw new ApprovalServiceError("EXPIRED", "Approval has expired");
  if (!await canReviewApproval(actorUserId, request.id)) throw new ApprovalServiceError("FORBIDDEN", "Actor cannot review this approval");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const updated = await transaction.approvalRequest.updateMany({
      where: { id: request.id, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.REJECTED, reviewedAt: now, reviewedByUserId: actorUserId, reviewNote: optionalNote?.trim() || null },
    });
    if (updated.count !== 1) throw new ApprovalServiceError("NOT_PENDING", "Approval was already reviewed");
    if (request.agentDecisionId) {
      await transaction.agentDecision.update({ where: { id: request.agentDecisionId }, data: { rejectedAt: now } });
    }
    const actions = request.type === ApprovalType.NUTRITION_ADJUSTMENT
      ? ["APPROVAL_REJECTED", "NUTRITION_ADJUSTMENT_REJECTED"]
      : ["APPROVAL_REJECTED"];
    await transaction.auditLog.createMany({
      data: actions.map((action) => ({
        actorUserId,
        gymId: request.gymId,
        action,
        targetType: "ApprovalRequest",
        targetId: request.id,
        metadata: { memberUserId: request.memberUserId },
      })),
    });
    return { approvalRequestId: request.id, status: ApprovalStatus.REJECTED };
  });
}
