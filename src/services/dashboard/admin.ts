import { z } from "zod";
import {
  AIEventStatus,
  Goal,
  GymRole,
  MediaPurpose,
  MediaType,
  MembershipStatus,
  NutritionPlanStatus,
  OnboardingStep,
  SystemRole,
  WorkoutProgramStatus,
  WorkoutSessionStatus,
} from "../../generated/prisma/client.js";
import { requireAdminActor } from "../../auth/dashboard-auth.js";
import { prisma } from "../../lib/prisma.js";
import {
  conciseSafeMetadata,
  opaqueIdSchema,
  pageWindow,
  paginatedResult,
  paginationSchema,
} from "./common.js";

const adminUsersFilterSchema = paginationSchema.extend({
  gymId: opaqueIdSchema.optional(),
  gymRole: z.enum(GymRole).optional(),
  goal: z.enum(Goal).optional(),
  onboarding: z.enum(["COMPLETE", "INCOMPLETE"]).optional(),
});

const aiFilterSchema = paginationSchema.extend({
  eventType: z.string().trim().max(80).optional(),
  status: z.enum(AIEventStatus).optional(),
  gymId: opaqueIdSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

const mediaFilterSchema = paginationSchema.extend({
  gymId: opaqueIdSchema.optional(),
  type: z.enum(MediaType).optional(),
  purpose: z.enum(MediaPurpose).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

const auditFilterSchema = paginationSchema.extend({
  gymId: opaqueIdSchema.optional(),
  action: z.string().trim().max(100).optional(),
});

export function userDisplayName(user: { firstName: string | null; lastName?: string | null; telegramUsername: string | null }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || (user.telegramUsername ? `@${user.telegramUsername}` : "Unnamed user");
}

export async function getAdminOverview(actorUserId: string) {
  await requireAdminActor(actorUserId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [totalGyms, activeGyms, totalUsers, activeMemberships, totalTrainers, totalMembers, pendingApprovals, aiRequestsToday, aiErrorsToday, photoSets, mediaRecords] = await Promise.all([
    prisma.gym.count(),
    prisma.gym.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.gymMembership.count({ where: { status: MembershipStatus.ACTIVE } }),
    prisma.gymMembership.count({ where: { role: GymRole.TRAINER, status: MembershipStatus.ACTIVE } }),
    prisma.gymMembership.count({ where: { role: GymRole.MEMBER, status: MembershipStatus.ACTIVE } }),
    prisma.approvalRequest.count({ where: { status: "PENDING" } }),
    prisma.aIEvent.count({ where: { createdAt: { gte: today } } }),
    prisma.aIEvent.count({ where: { createdAt: { gte: today }, status: AIEventStatus.ERROR } }),
    prisma.progressPhotoSet.count(),
    prisma.media.count(),
  ]);
  return { totalGyms, activeGyms, totalUsers, activeMemberships, totalTrainers, totalMembers, pendingApprovals, aiRequestsToday, aiErrorsToday, photoSets, mediaRecords };
}

export async function getAdminGyms(actorUserId: string, input: unknown) {
  await requireAdminActor(actorUserId);
  const pagination = paginationSchema.parse(input);
  const where = pagination.search ? { name: { contains: pagination.search, mode: "insensitive" as const } } : {};
  const [gyms, total] = await Promise.all([
    prisma.gym.findMany({
      where,
      ...pageWindow(pagination),
      include: { settings: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.gym.count({ where }),
  ]);
  const gymIds = gyms.map(({ id }) => id);
  const [membershipCounts, pendingCounts] = await Promise.all([
    prisma.gymMembership.groupBy({
      by: ["gymId", "role"],
      where: { gymId: { in: gymIds }, status: MembershipStatus.ACTIVE },
      _count: { _all: true },
    }),
    prisma.approvalRequest.groupBy({
      by: ["gymId"],
      where: { gymId: { in: gymIds }, status: "PENDING" },
      _count: { _all: true },
    }),
  ]);
  const items = gyms.map((gym) => ({
    ...gym,
    memberCount: membershipCounts.find((item) => item.gymId === gym.id && item.role === GymRole.MEMBER)?._count._all ?? 0,
    trainerCount: membershipCounts.find((item) => item.gymId === gym.id && item.role === GymRole.TRAINER)?._count._all ?? 0,
    pendingApprovals: pendingCounts.find((item) => item.gymId === gym.id)?._count._all ?? 0,
    aiDisplayName: gym.settings?.aiDisplayName ?? gym.aiName,
  }));
  return paginatedResult(items, total, pagination);
}

export async function getAdminGymDetail(actorUserId: string, gymId: string) {
  await requireAdminActor(actorUserId);
  opaqueIdSchema.parse(gymId);
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    include: {
      settings: true,
      memberships: {
        where: { status: MembershipStatus.ACTIVE, role: GymRole.OWNER },
        include: { user: { select: { id: true, firstName: true, lastName: true, telegramUsername: true } } },
      },
      exerciseAvailability: { include: { exercise: { select: { name: true, slug: true } } }, orderBy: { updatedAt: "desc" }, take: 20 },
      aiEvents: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, eventType: true, status: true, model: true, latencyMs: true, createdAt: true } },
      progressEvaluations: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, userId: true, action: true, summary: true, createdAt: true } },
    },
  });
  if (!gym) return null;
  const [memberCount, trainerCount, pendingApprovals] = await Promise.all([
    prisma.gymMembership.count({ where: { gymId, role: GymRole.MEMBER, status: MembershipStatus.ACTIVE } }),
    prisma.gymMembership.count({ where: { gymId, role: GymRole.TRAINER, status: MembershipStatus.ACTIVE } }),
    prisma.approvalRequest.count({ where: { gymId, status: "PENDING" } }),
  ]);
  return { ...gym, memberCount, trainerCount, pendingApprovals };
}

export async function getAdminUsers(actorUserId: string, input: unknown) {
  await requireAdminActor(actorUserId);
  const filter = adminUsersFilterSchema.parse(input);
  const where = {
    ...(filter.search ? {
      OR: [
        { firstName: { contains: filter.search, mode: "insensitive" as const } },
        { lastName: { contains: filter.search, mode: "insensitive" as const } },
        { telegramUsername: { contains: filter.search, mode: "insensitive" as const } },
      ],
    } : {}),
    ...(filter.goal ? { profile: { goal: filter.goal } } : {}),
    ...(filter.onboarding ? { onboardingStep: filter.onboarding === "COMPLETE" ? OnboardingStep.COMPLETE : { not: OnboardingStep.COMPLETE } } : {}),
    ...((filter.gymId || filter.gymRole) ? {
      gymMemberships: { some: {
        ...(filter.gymId ? { gymId: filter.gymId } : {}),
        ...(filter.gymRole ? { role: filter.gymRole } : {}),
        status: MembershipStatus.ACTIVE,
      } },
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      ...pageWindow(filter),
      include: {
        profile: { select: { goal: true, weightKg: true } },
        gymMemberships: { where: { status: MembershipStatus.ACTIVE }, include: { gym: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getAdminUserDetail(actorUserId: string, userId: string) {
  await requireAdminActor(actorUserId);
  opaqueIdSchema.parse(userId);
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      gymMemberships: { where: { status: MembershipStatus.ACTIVE }, include: { gym: { include: { settings: true } } } },
      memberAssignments: { include: { trainer: { select: { id: true, firstName: true, lastName: true, telegramUsername: true } }, gym: { select: { id: true, name: true } } } },
      bodyMeasurements: { orderBy: { measuredAt: "asc" }, take: 100 },
      weeklyCheckIns: { orderBy: { createdAt: "desc" }, take: 20, include: { evaluation: true } },
      workoutPrograms: {
        orderBy: { startedAt: "desc" }, take: 5,
        include: { days: { orderBy: { dayNumber: "asc" }, include: { exercises: { orderBy: { order: "asc" }, include: { exercise: true } } } } },
      },
      workoutSessions: {
        where: { status: WorkoutSessionStatus.COMPLETED }, orderBy: { completedAt: "desc" }, take: 10,
        include: { workoutDay: { select: { name: true } }, exerciseLogs: { include: { exercise: true, setLogs: true } } },
      },
      nutritionPlans: {
        orderBy: { startedAt: "desc" }, take: 10,
        include: { target: true, meals: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" }, include: { food: true } } } } },
      },
      progressPhotoSets: {
        orderBy: { capturedAt: "desc" }, take: 20,
        include: { analysis: true, photos: { select: { id: true, view: true, visibility: true } } },
      },
      aiEvents: { orderBy: { createdAt: "desc" }, take: 25 },
      agentDecisions: { orderBy: { createdAt: "desc" }, take: 25, include: { approvalRequest: true } },
      memberApprovals: { orderBy: { createdAt: "desc" }, take: 20 },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
}

export async function getAdminAIObservability(actorUserId: string, input: unknown) {
  await requireAdminActor(actorUserId);
  const filter = aiFilterSchema.parse(input);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateWhere = {
    ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
    ...(filter.dateTo ? { lte: filter.dateTo } : {}),
  };
  const where = {
    ...(filter.eventType ? { eventType: filter.eventType } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.gymId ? { gymId: filter.gymId } : {}),
    ...(Object.keys(dateWhere).length ? { createdAt: dateWhere } : {}),
  };
  const [events, total, totalAll, requestsToday, successes, errors, latency, eventTypes, models, tokenTotals, recentErrors, toolFailures, toolLatency] = await Promise.all([
    prisma.aIEvent.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, telegramUsername: true } },
        gym: { select: { name: true } },
        toolExecutions: { orderBy: { createdAt: "asc" }, take: 8, select: { toolName: true, status: true, durationMs: true } },
      },
    }),
    prisma.aIEvent.count({ where }),
    prisma.aIEvent.count(),
    prisma.aIEvent.count({ where: { createdAt: { gte: today } } }),
    prisma.aIEvent.count({ where: { status: AIEventStatus.SUCCESS } }),
    prisma.aIEvent.count({ where: { status: AIEventStatus.ERROR } }),
    prisma.aIEvent.aggregate({ _avg: { latencyMs: true } }),
    prisma.aIEvent.groupBy({ by: ["eventType"], _count: { _all: true } }),
    prisma.aIEvent.groupBy({ by: ["model"], where: { model: { not: null } }, _count: { _all: true } }),
    prisma.aIEvent.aggregate({ _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true } }),
    prisma.aIEvent.findMany({ where: { status: AIEventStatus.ERROR }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, eventType: true, model: true, errorMessage: true, createdAt: true } }),
    prisma.aIToolExecution.count({ where: { status: { in: ["ERROR", "TIMEOUT", "REJECTED"] } } }),
    prisma.aIToolExecution.aggregate({ _avg: { durationMs: true } }),
  ]);
  return {
    metrics: {
      total: totalAll,
      requestsToday,
      successes,
      errors,
      averageLatencyMs: latency._avg.latencyMs,
      inputTokens: tokenTotals._sum.inputTokens,
      outputTokens: tokenTotals._sum.outputTokens,
      estimatedCostUsd: tokenTotals._sum.estimatedCostUsd?.toString() ?? null,
      toolFailures,
      averageToolLatencyMs: toolLatency._avg.durationMs,
    },
    eventTypes,
    models,
    recentErrors,
    events: paginatedResult(events, total, filter),
  };
}

export async function getAdminAIEventDetail(actorUserId: string, eventId: string) {
  await requireAdminActor(actorUserId);
  opaqueIdSchema.parse(eventId);
  return prisma.aIEvent.findUnique({
    where: { id: eventId },
    include: {
      user: { select: { id: true, firstName: true, telegramUsername: true } },
      gym: { select: { id: true, name: true } },
      toolExecutions: {
        orderBy: { createdAt: "asc" },
        select: { id: true, toolName: true, status: true, durationMs: true, inputSummary: true, outputSummary: true, errorMessage: true, createdAt: true },
      },
    },
  });
}

export async function getAdminMedia(actorUserId: string, input: unknown) {
  await requireAdminActor(actorUserId);
  const filter = mediaFilterSchema.parse(input);
  const dateWhere = { ...(filter.dateFrom ? { gte: filter.dateFrom } : {}), ...(filter.dateTo ? { lte: filter.dateTo } : {}) };
  const where = {
    ...(filter.gymId ? { gymId: filter.gymId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.purpose ? { purpose: filter.purpose } : {}),
    ...(Object.keys(dateWhere).length ? { createdAt: dateWhere } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, firstName: true, telegramUsername: true } }, gym: { select: { id: true, name: true } } },
    }),
    prisma.media.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getAdminApprovals(actorUserId: string, input: unknown) {
  await requireAdminActor(actorUserId);
  const filter = paginationSchema.parse(input);
  const where = filter.search ? {
    OR: [
      { reference: { contains: filter.search, mode: "insensitive" as const } },
      { member: { firstName: { contains: filter.search, mode: "insensitive" as const } } },
      { member: { telegramUsername: { contains: filter.search, mode: "insensitive" as const } } },
    ],
  } : {};
  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "desc" },
      include: { member: { select: { id: true, firstName: true, telegramUsername: true } }, trainer: { select: { firstName: true } }, gym: { select: { id: true, name: true } } },
    }),
    prisma.approvalRequest.count({ where }),
  ]);
  return paginatedResult(items, total, filter);
}

export async function getAdminAudit(actorUserId: string, input: unknown) {
  await requireAdminActor(actorUserId);
  const filter = auditFilterSchema.parse(input);
  const where = {
    ...(filter.gymId ? { gymId: filter.gymId } : {}),
    ...(filter.action ? { action: { contains: filter.action, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, ...pageWindow(filter), orderBy: { createdAt: "desc" },
      include: { actorUser: { select: { firstName: true, telegramUsername: true } }, gym: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paginatedResult(items.map((item) => ({ ...item, metadata: conciseSafeMetadata(item.metadata) })), total, filter);
}

export const adminDashboardSchemas = {
  users: adminUsersFilterSchema,
  ai: aiFilterSchema,
  media: mediaFilterSchema,
  audit: auditFilterSchema,
};
