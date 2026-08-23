import { ApprovalStatus, CheckInStatus, ProgressDecisionAction, WorkoutSessionStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { requireOwnerMemberAccess, requireTrainerMemberAccess } from "../../auth/dashboard-auth.js";

const DAY_MS = 86_400_000;
export type AttentionSeverity = "INFO" | "WARNING" | "HIGH";
export type AttentionSignalType =
  | "CHECKIN_OVERDUE"
  | "LOW_NUTRITION_ADHERENCE"
  | "WORKOUT_INACTIVITY"
  | "PENDING_COACH_REVIEW"
  | "RECOVERY_WARNING"
  | "STALLED_PROGRESS";

export interface MemberAttentionSignal {
  type: AttentionSignalType;
  severity: AttentionSeverity;
  message: string;
}

export interface MemberAttentionInput {
  now?: Date;
  lastCheckInAt: Date | null;
  nutritionAdherencePct: number | null;
  lastWorkoutAt: Date | null;
  hasPendingApproval: boolean;
  hungerRating: number | null;
  energyRating: number | null;
  averageSleepHours: number | null;
  latestAction: ProgressDecisionAction | null;
  reasonCodes: string[];
}

function daysSince(date: Date | null, now: Date): number | null {
  return date ? Math.floor((now.getTime() - date.getTime()) / DAY_MS) : null;
}

export function deriveMemberAttentionSignals(input: MemberAttentionInput): MemberAttentionSignal[] {
  const now = input.now ?? new Date();
  const signals: MemberAttentionSignal[] = [];
  const checkInDays = daysSince(input.lastCheckInAt, now);
  if (checkInDays === null || checkInDays >= 10) {
    signals.push({ type: "CHECKIN_OVERDUE", severity: checkInDays === null ? "WARNING" : "HIGH", message: "No evaluated check-in in the last 10 days." });
  }
  if (input.nutritionAdherencePct !== null && input.nutritionAdherencePct < 70) {
    signals.push({ type: "LOW_NUTRITION_ADHERENCE", severity: "WARNING", message: "Recent reported nutrition adherence is below 70%." });
  }
  const workoutDays = daysSince(input.lastWorkoutAt, now);
  if (workoutDays === null || workoutDays >= 10) {
    signals.push({ type: "WORKOUT_INACTIVITY", severity: "WARNING", message: "No completed workout recorded in the last 10 days." });
  }
  if (input.hasPendingApproval || input.latestAction === ProgressDecisionAction.COACH_REVIEW_REQUIRED) {
    signals.push({ type: "PENDING_COACH_REVIEW", severity: "HIGH", message: "A coaching decision needs review before any plan change." });
  }
  if ((input.hungerRating !== null && input.hungerRating >= 9)
    || (input.energyRating !== null && input.energyRating <= 2)
    || (input.averageSleepHours !== null && input.averageSleepHours < 5)) {
    signals.push({ type: "RECOVERY_WARNING", severity: "HIGH", message: "Recent self-reported recovery signals merit a supportive review." });
  }
  if (input.reasonCodes.some((code) => code.includes("SLOW") || code.includes("STABLE_WEIGHT"))) {
    signals.push({ type: "STALLED_PROGRESS", severity: "INFO", message: "Recent trend signals suggest progress may be stalled." });
  }
  return signals;
}

export async function getMemberAttentionSignals(params: {
  actorUserId: string;
  gymId: string;
  memberUserId: string;
  access: "OWNER" | "TRAINER";
}) {
  if (params.access === "OWNER") {
    await requireOwnerMemberAccess(params.actorUserId, params.gymId, params.memberUserId);
  } else {
    await requireTrainerMemberAccess(params.actorUserId, params.gymId, params.memberUserId);
  }
  const [checkIn, workout, pending, evaluation] = await Promise.all([
    prisma.weeklyCheckIn.findFirst({
      where: { userId: params.memberUserId, gymId: params.gymId, status: CheckInStatus.EVALUATED },
      orderBy: { evaluatedAt: "desc" },
    }),
    prisma.workoutSession.findFirst({
      where: { userId: params.memberUserId, gymId: params.gymId, status: WorkoutSessionStatus.COMPLETED },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.approvalRequest.count({
      where: { memberUserId: params.memberUserId, gymId: params.gymId, status: ApprovalStatus.PENDING },
    }),
    prisma.progressEvaluation.findFirst({
      where: { userId: params.memberUserId, gymId: params.gymId },
      orderBy: { createdAt: "desc" },
      select: { action: true, reasonCodes: true },
    }),
  ]);
  return deriveMemberAttentionSignals({
    lastCheckInAt: checkIn?.evaluatedAt ?? null,
    nutritionAdherencePct: checkIn?.nutritionAdherencePct ?? null,
    lastWorkoutAt: workout?.completedAt ?? null,
    hasPendingApproval: pending > 0,
    hungerRating: checkIn?.hungerRating ?? null,
    energyRating: checkIn?.energyRating ?? null,
    averageSleepHours: checkIn?.averageSleepHours ?? null,
    latestAction: evaluation?.action ?? null,
    reasonCodes: Array.isArray(evaluation?.reasonCodes)
      ? evaluation.reasonCodes.filter((item): item is string => typeof item === "string")
      : [],
  });
}
