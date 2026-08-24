import { MembershipStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getSafeMemorySummary } from "../services/agent-memory.js";
import { getEffectiveCoachConfiguration } from "../services/coach-configuration.js";
import { getNutritionTargets, getMealPlanSummary } from "../services/nutrition-plans.js";
import { getPhotoProgressSummary } from "../services/photo-analysis.js";
import { getLatestProgressDecision, getProgressSummary } from "../services/progress.js";
import { getMemberTrainer } from "../services/trainers.js";
import { getUserProfileById } from "../services/users.js";
import { getActiveWorkoutProgram } from "../services/workout-programs.js";
import { getCurrentWorkoutSession, getRecentWorkoutHistory } from "../services/workout-sessions.js";
import type { AgentActor } from "./types.js";

export interface BuiltAgentContext {
  actor: AgentActor;
  user: Awaited<ReturnType<typeof getUserProfileById>>;
  gym: Awaited<ReturnType<typeof getEffectiveCoachConfiguration>>["gym"];
  trainer: {
    displayName: string | null;
    username: string | null;
  } | null;
  workout: {
    program: { name: string; split: string; trainingDaysPerWeek: number; days: Array<{ dayNumber: number; name: string }> } | null;
    currentSession: { dayName: string | null; startedAt: Date | null; exercises: Array<{ order: number; name: string; loggedSets: number }> } | null;
    recentSessions: Array<{ completedAt: Date | null; dayName: string | null }>;
  };
  nutrition: {
    targets: Awaited<ReturnType<typeof getNutritionTargets>>;
    planSummary: Awaited<ReturnType<typeof getMealPlanSummary>>;
  };
  progress: {
    summary: Awaited<ReturnType<typeof getProgressSummary>>;
    latestDecision: Awaited<ReturnType<typeof getLatestProgressDecision>>;
  };
  photos: Awaited<ReturnType<typeof getPhotoProgressSummary>>;
  memory: Awaited<ReturnType<typeof getSafeMemorySummary>>;
  gymOptions: Array<{ gymId: string; name: string }>;
}
export async function buildAgentContext(userId: string, requestedGymId?: string): Promise<BuiltAgentContext> {
  const userIdentity = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      systemRole: true,
      gymMemberships: {
        where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
        include: { gym: { include: { settings: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!userIdentity) throw new Error("User context not found");
  const selected = requestedGymId
    ? userIdentity.gymMemberships.find((membership) => membership.gymId === requestedGymId)
    : userIdentity.gymMemberships.length === 1 ? userIdentity.gymMemberships[0] : undefined;
  if (requestedGymId && !selected) throw new Error("Requested gym is outside the user's active scope");
  const gymSelectionRequired = !requestedGymId && userIdentity.gymMemberships.length > 1;
  const gymId = selected?.gymId ?? null;
  const configuration = gymSelectionRequired
    ? null
    : await getEffectiveCoachConfiguration(userId, gymId ?? undefined);
  const [user, program, currentSession, recentSessions, targets, planSummary, progress, latestDecision, photos, memory, trainer] = await Promise.all([
    getUserProfileById(userId),
    getActiveWorkoutProgram(userId),
    getCurrentWorkoutSession(userId),
    getRecentWorkoutHistory(userId, 3),
    getNutritionTargets(userId),
    getMealPlanSummary(userId),
    getProgressSummary(userId),
    getLatestProgressDecision(userId),
    getPhotoProgressSummary(userId),
    getSafeMemorySummary(userId, gymId ?? undefined),
    gymId ? getMemberTrainer(userId, gymId) : Promise.resolve(null),
  ]);
  return {
    actor: {
      userId,
      gymId,
      systemRole: userIdentity.systemRole,
      gymRole: selected?.role ?? null,
      allowActions: true,
      gymSelectionRequired,
    },
    user,
    gym: configuration?.gym ?? null,
    trainer: trainer ? {
      displayName: trainer.trainer.trainerProfile?.displayName ?? trainer.trainer.firstName ?? null,
      username: trainer.trainer.telegramUsername,
    } : null,
    workout: {
      program: program ? {
        name: program.name,
        split: program.split,
        trainingDaysPerWeek: program.trainingDaysPerWeek,
        days: program.days.map((day) => ({ dayNumber: day.dayNumber, name: day.name })),
      } : null,
      currentSession: currentSession ? {
        dayName: currentSession.workoutDay?.name ?? null,
        startedAt: currentSession.startedAt,
        exercises: currentSession.exerciseLogs.map((log) => ({ order: log.order, name: log.exercise.name, loggedSets: log.setLogs.length })),
      } : null,
      recentSessions: recentSessions.map((session) => ({ completedAt: session.completedAt, dayName: session.workoutDay?.name ?? null })),
    },
    nutrition: { targets, planSummary },
    progress: { summary: progress, latestDecision },
    photos,
    memory,
    gymOptions: userIdentity.gymMemberships.map((membership) => ({
      gymId: membership.gymId,
      name: membership.gym.settings?.displayName ?? membership.gym.name,
    })),
  };
}
