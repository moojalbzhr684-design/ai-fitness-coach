import { z } from "zod";
import {
  ApprovalStatus,
  CheckInStatus,
  Goal,
  GymRole,
  WorkoutSessionStatus,
} from "../../generated/prisma/client.js";
import {
  DashboardAuthorizationError,
  requireTrainerMemberAccess,
  resolveDashboardGym,
} from "../../auth/dashboard-auth.js";
import { prisma } from "../../lib/prisma.js";
import { getPendingApprovalsForTrainer } from "../approvals.js";
import { deriveMemberAttentionSignals } from "./attention.js";
import { opaqueIdSchema, pageWindow, paginatedResult, paginationSchema } from "./common.js";
import { getCoachingMemberRecord } from "./member-data.js";

const trainerMembersFilterSchema = paginationSchema.extend({ goal: z.enum(Goal).optional() });

async function requireTrainerGym(actorUserId: string, gymId: string) {
  const scope = await resolveDashboardGym({ actorUserId, role: GymRole.TRAINER, requestedGymId: gymId });
  return scope.membership!;
}

function reasonCodes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getTrainerOverview(actorUserId: string, gymId: string) {
  const membership = await requireTrainerGym(actorUserId, gymId);
  const [assignments, approvals] = await Promise.all([
    prisma.trainerAssignment.findMany({
      where: { gymId, trainerUserId: actorUserId },
      include: { member: { include: {
        profile: { select: { goal: true, weightKg: true } },
        weeklyCheckIns: { where: { gymId, status: CheckInStatus.EVALUATED }, orderBy: { evaluatedAt: "desc" }, take: 1 },
        workoutSessions: { where: { gymId, status: WorkoutSessionStatus.COMPLETED }, orderBy: { completedAt: "desc" }, take: 1 },
        memberApprovals: { where: { gymId, status: ApprovalStatus.PENDING }, take: 1 },
        progressEvaluations: { where: { gymId }, orderBy: { createdAt: "desc" }, take: 1 },
      } } },
      orderBy: { createdAt: "asc" },
    }),
    getPendingApprovalsForTrainer(actorUserId, gymId),
  ]);
  const memberProgress = assignments.map(({ member }) => {
    const checkIn = member.weeklyCheckIns[0];
    const evaluation = member.progressEvaluations[0];
    return {
      userId: member.id,
      name: member.firstName ?? member.telegramUsername ?? "Member",
      goal: member.profile?.goal ?? null,
      weightKg: member.profile?.weightKg ?? null,
      lastCheckInAt: checkIn?.evaluatedAt ?? null,
      latestDecision: evaluation?.summary ?? null,
      signals: deriveMemberAttentionSignals({
        lastCheckInAt: checkIn?.evaluatedAt ?? null,
        nutritionAdherencePct: checkIn?.nutritionAdherencePct ?? null,
        lastWorkoutAt: member.workoutSessions[0]?.completedAt ?? null,
        hasPendingApproval: member.memberApprovals.length > 0,
        hungerRating: checkIn?.hungerRating ?? null,
        energyRating: checkIn?.energyRating ?? null,
        averageSleepHours: checkIn?.averageSleepHours ?? null,
        latestAction: evaluation?.action ?? null,
        reasonCodes: reasonCodes(evaluation?.reasonCodes),
      }),
    };
  });
  return {
    gym: membership.gym,
    assignedMemberCount: assignments.length,
    pendingApprovalCount: approvals.length,
    needingReviewCount: memberProgress.filter((item) => item.signals.some((signal) => signal.severity === "HIGH")).length,
    memberProgress,
  };
}

export async function getTrainerMembersDashboard(actorUserId: string, gymId: string, input: unknown) {
  await requireTrainerGym(actorUserId, gymId);
  const filter = trainerMembersFilterSchema.parse(input);
  const memberFilters = [
    ...(filter.search ? [{ member: { OR: [
      { firstName: { contains: filter.search, mode: "insensitive" as const } },
      { telegramUsername: { contains: filter.search, mode: "insensitive" as const } },
    ] } }] : []),
    ...(filter.goal ? [{ member: { profile: { goal: filter.goal } } }] : []),
  ];
  const where = {
    gymId,
    trainerUserId: actorUserId,
    ...(memberFilters.length ? { AND: memberFilters } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.trainerAssignment.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "asc" },
      include: { member: { include: {
        profile: { select: { goal: true, weightKg: true } },
        weeklyCheckIns: { where: { gymId, status: CheckInStatus.EVALUATED }, orderBy: { evaluatedAt: "desc" }, take: 1 },
        workoutSessions: { where: { gymId, status: WorkoutSessionStatus.COMPLETED }, orderBy: { completedAt: "desc" }, take: 1 },
        agentDecisions: { where: { gymId }, orderBy: { createdAt: "desc" }, take: 1 },
      } } },
    }),
    prisma.trainerAssignment.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getTrainerMemberDetail(actorUserId: string, gymId: string, memberUserId: string) {
  opaqueIdSchema.parse(memberUserId);
  await requireTrainerMemberAccess(actorUserId, gymId, memberUserId);
  const member = await getCoachingMemberRecord(gymId, memberUserId, "TRAINER");
  if (!member) throw new DashboardAuthorizationError("NOT_FOUND", "Member not found");
  return member;
}

export async function getTrainerApprovals(actorUserId: string, gymId: string, input: unknown) {
  await requireTrainerGym(actorUserId, gymId);
  const filter = paginationSchema.parse(input);
  const approvals = await getPendingApprovalsForTrainer(actorUserId, gymId);
  const searched = filter.search
    ? approvals.filter((request) => {
        const text = `${request.member.firstName ?? ""} ${request.member.telegramUsername ?? ""} ${request.reference}`.toLowerCase();
        return text.includes(filter.search!.toLowerCase());
      })
    : approvals;
  const { skip, take } = pageWindow(filter);
  return paginatedResult(searched.slice(skip, skip + take), searched.length, filter);
}

export const trainerDashboardSchemas = { members: trainerMembersFilterSchema };
