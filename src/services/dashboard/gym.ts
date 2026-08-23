import { z } from "zod";
import {
  ApprovalStatus,
  CheckInStatus,
  Goal,
  GymRole,
  MembershipStatus,
  WorkoutSessionStatus,
} from "../../generated/prisma/client.js";
import {
  DashboardAuthorizationError,
  requireOwnerMemberAccess,
  resolveDashboardGym,
} from "../../auth/dashboard-auth.js";
import { prisma } from "../../lib/prisma.js";
import { deriveMemberAttentionSignals } from "./attention.js";
import { opaqueIdSchema, pageWindow, paginatedResult, paginationSchema } from "./common.js";
import { getCoachingMemberRecord } from "./member-data.js";

const gymMembersFilterSchema = paginationSchema.extend({
  trainerUserId: opaqueIdSchema.optional(),
  goal: z.enum(Goal).optional(),
  checkIn: z.enum(["RECENT", "OVERDUE"]).optional(),
});

async function requireOwnerGym(actorUserId: string, gymId: string) {
  const scope = await resolveDashboardGym({ actorUserId, role: GymRole.OWNER, requestedGymId: gymId });
  return scope.membership!;
}

function reasonCodes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getGymOverview(actorUserId: string, gymId: string) {
  const membership = await requireOwnerGym(actorUserId, gymId);
  const sinceTenDays = new Date(Date.now() - 10 * 86_400_000);
  const [members, trainers, pendingApprovals, recentCheckIns, recentAI, settings, attentionRows] = await Promise.all([
    prisma.gymMembership.count({ where: { gymId, role: GymRole.MEMBER, status: MembershipStatus.ACTIVE } }),
    prisma.gymMembership.count({ where: { gymId, role: GymRole.TRAINER, status: MembershipStatus.ACTIVE } }),
    prisma.approvalRequest.count({ where: { gymId, status: ApprovalStatus.PENDING } }),
    prisma.weeklyCheckIn.count({ where: { gymId, status: CheckInStatus.EVALUATED, evaluatedAt: { gte: sinceTenDays } } }),
    prisma.aIEvent.groupBy({ by: ["status"], where: { gymId, createdAt: { gte: sinceTenDays } }, _count: { _all: true } }),
    prisma.gymSettings.findUnique({ where: { gymId } }),
    prisma.gymMembership.findMany({
      where: { gymId, role: GymRole.MEMBER, status: MembershipStatus.ACTIVE }, take: 12, orderBy: { createdAt: "asc" },
      include: {
        user: {
          include: {
            weeklyCheckIns: { where: { gymId, status: CheckInStatus.EVALUATED }, orderBy: { evaluatedAt: "desc" }, take: 1 },
            workoutSessions: { where: { gymId, status: WorkoutSessionStatus.COMPLETED }, orderBy: { completedAt: "desc" }, take: 1 },
            memberApprovals: { where: { gymId, status: ApprovalStatus.PENDING }, take: 1 },
            progressEvaluations: { where: { gymId }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    }),
  ]);
  const attention = attentionRows.map(({ user }) => {
    const checkIn = user.weeklyCheckIns[0];
    const evaluation = user.progressEvaluations[0];
    return {
      userId: user.id,
      name: user.firstName ?? user.telegramUsername ?? "Member",
      signals: deriveMemberAttentionSignals({
        lastCheckInAt: checkIn?.evaluatedAt ?? null,
        nutritionAdherencePct: checkIn?.nutritionAdherencePct ?? null,
        lastWorkoutAt: user.workoutSessions[0]?.completedAt ?? null,
        hasPendingApproval: user.memberApprovals.length > 0,
        hungerRating: checkIn?.hungerRating ?? null,
        energyRating: checkIn?.energyRating ?? null,
        averageSleepHours: checkIn?.averageSleepHours ?? null,
        latestAction: evaluation?.action ?? null,
        reasonCodes: reasonCodes(evaluation?.reasonCodes),
      }),
    };
  }).filter((item) => item.signals.length > 0);
  return { gym: membership.gym, members, trainers, pendingApprovals, recentCheckIns, recentAI, settings, attention };
}

export async function getGymMembers(actorUserId: string, gymId: string, input: unknown) {
  await requireOwnerGym(actorUserId, gymId);
  const filter = gymMembersFilterSchema.parse(input);
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
  const userFilters = [
    ...(filter.search ? [{ user: { OR: [
      { firstName: { contains: filter.search, mode: "insensitive" as const } },
      { telegramUsername: { contains: filter.search, mode: "insensitive" as const } },
    ] } }] : []),
    ...(filter.goal ? [{ user: { profile: { goal: filter.goal } } }] : []),
    ...(filter.trainerUserId ? [{ user: { memberAssignments: { some: { gymId, trainerUserId: filter.trainerUserId } } } }] : []),
    ...(filter.checkIn === "RECENT" ? [{ user: { weeklyCheckIns: { some: { gymId, status: CheckInStatus.EVALUATED, evaluatedAt: { gte: tenDaysAgo } } } } }] : []),
    ...(filter.checkIn === "OVERDUE" ? [{ user: { weeklyCheckIns: { none: { gymId, status: CheckInStatus.EVALUATED, evaluatedAt: { gte: tenDaysAgo } } } } }] : []),
  ];
  const where = {
    gymId,
    role: GymRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    ...(userFilters.length ? { AND: userFilters } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.gymMembership.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "desc" },
      include: { user: { include: {
        profile: { select: { goal: true, weightKg: true } },
        memberAssignments: { where: { gymId, isPrimary: true }, include: { trainer: { select: { id: true, firstName: true, telegramUsername: true } } } },
        weeklyCheckIns: { where: { gymId, status: CheckInStatus.EVALUATED }, orderBy: { evaluatedAt: "desc" }, take: 1 },
        agentDecisions: { where: { gymId }, orderBy: { createdAt: "desc" }, take: 1 },
      } } },
    }),
    prisma.gymMembership.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getGymMemberDetail(actorUserId: string, gymId: string, memberUserId: string) {
  opaqueIdSchema.parse(memberUserId);
  await requireOwnerMemberAccess(actorUserId, gymId, memberUserId);
  const member = await getCoachingMemberRecord(gymId, memberUserId, "GYM");
  if (!member) throw new DashboardAuthorizationError("NOT_FOUND", "Member not found");
  return member;
}

export async function getGymTrainers(actorUserId: string, gymId: string, input: unknown) {
  await requireOwnerGym(actorUserId, gymId);
  const filter = paginationSchema.parse(input);
  const where = {
    gymId, role: GymRole.TRAINER, status: MembershipStatus.ACTIVE,
    ...(filter.search ? { user: { OR: [
      { firstName: { contains: filter.search, mode: "insensitive" as const } },
      { telegramUsername: { contains: filter.search, mode: "insensitive" as const } },
    ] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.gymMembership.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "asc" },
      include: { user: { include: {
        trainerProfile: true,
        trainerAssignments: { where: { gymId }, include: { member: { select: { id: true, firstName: true, telegramUsername: true } } } },
        trainerApprovals: { where: { gymId, status: ApprovalStatus.PENDING }, select: { id: true } },
      } } },
    }),
    prisma.gymMembership.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getGymApprovals(actorUserId: string, gymId: string, input: unknown) {
  await requireOwnerGym(actorUserId, gymId);
  const filter = paginationSchema.parse(input);
  const where = {
    gymId,
    ...(filter.search ? { OR: [
      { member: { firstName: { contains: filter.search, mode: "insensitive" as const } } },
      { reference: { contains: filter.search, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({ where, ...pageWindow(filter), orderBy: { createdAt: "desc" }, include: { member: { select: { id: true, firstName: true, telegramUsername: true } }, trainer: { select: { firstName: true } } } }),
    prisma.approvalRequest.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getGymSettingsDashboard(actorUserId: string, gymId: string) {
  const membership = await requireOwnerGym(actorUserId, gymId);
  const settings = await prisma.gymSettings.findUnique({ where: { gymId } });
  return { gym: membership.gym, settings };
}

export const gymDashboardSchemas = { members: gymMembersFilterSchema };
