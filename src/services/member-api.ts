import { GymRole, MembershipStatus, PhotoAnalysisStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { getPendingApprovalsForMember } from "./approvals.js";
import { getActiveNutritionPlan, getNutritionTargets } from "./nutrition-plans.js";
import { getLatestPhotoAnalysisSummary } from "./photo-analysis.js";
import { getCheckInStatus, getLatestProgressDecision, getProgressSummary, getRecentMeasurements } from "./progress.js";
import { getMemberTrainer } from "./trainers.js";
import { getActiveWorkoutProgram } from "./workout-programs.js";
import { getCurrentWorkoutSession, getRecentWorkoutHistory } from "./workout-sessions.js";

function displayName(user: { firstName: string | null; lastName: string | null; telegramUsername: string | null }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.telegramUsername || "عضو";
}

function safeColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export async function getMemberIdentityPayload(userId: string, gymId: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      identities: { select: { provider: true, email: true, isVerified: true } },
      gymMemberships: {
        where: { role: GymRole.MEMBER, status: MembershipStatus.ACTIVE, gym: { isActive: true } },
        include: { gym: { include: { settings: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) return null;
  const membership = gymId
    ? user.gymMemberships.find((item) => item.gymId === gymId)
    : user.gymMemberships.length === 1 ? user.gymMemberships[0] : undefined;
  const gym = membership?.gym ?? null;
  const trainer = gymId ? await getMemberTrainer(userId, gymId) : null;
  return {
    displayName: displayName(user),
    onboardingState: user.onboardingStep,
    profile: user.profile ? {
      age: user.profile.age,
      sex: user.profile.sex,
      heightCm: user.profile.heightCm,
      weightKg: user.profile.weightKg,
      activityLevel: user.profile.activityLevel,
      experienceLevel: user.profile.experienceLevel,
      goal: user.profile.goal,
      trainingDaysPerWeek: user.profile.trainingDaysPerWeek,
      sessionMinutes: user.profile.sessionMinutes,
      trainingPlace: user.profile.trainingPlace,
      mealsPerDay: user.profile.mealsPerDay,
    } : null,
    email: user.identities.find((item) => item.provider === "EMAIL" && item.isVerified)?.email ?? null,
    gym: gym ? { displayName: gym.settings?.displayName ?? gym.name } : null,
    trainer: trainer ? {
      displayName: trainer.trainer.trainerProfile?.displayName ?? trainer.trainer.firstName ?? "الكابتن",
    } : null,
    coach: {
      displayName: gym?.settings?.aiDisplayName ?? gym?.aiName ?? "AI Coach",
    },
    branding: {
      displayName: gym?.settings?.displayName ?? gym?.name ?? "AI Fitness Coach",
      aiDisplayName: gym?.settings?.aiDisplayName ?? gym?.aiName ?? "AI Coach",
      primaryColor: safeColor(gym?.settings?.primaryColor ?? gym?.primaryColor, "#2563eb"),
      secondaryColor: safeColor(gym?.settings?.secondaryColor ?? gym?.secondaryColor, "#16a34a"),
    },
    gymSelectionRequired: !gymId && user.gymMemberships.length > 1,
    gymOptions: user.gymMemberships.map((item) => ({ gymRef: item.gymId, displayName: item.gym.settings?.displayName ?? item.gym.name })),
  };
}

export function workoutProgramPayload(program: NonNullable<Awaited<ReturnType<typeof getActiveWorkoutProgram>>>) {
  return {
    name: program.name,
    split: program.split,
    trainingDaysPerWeek: program.trainingDaysPerWeek,
    days: program.days.map((day) => ({
      dayNumber: day.dayNumber,
      name: day.name,
      notes: day.notes,
      exercises: day.exercises.map((item) => ({
        order: item.order,
        name: item.exercise.name,
        sets: item.sets,
        repMin: item.repMin,
        repMax: item.repMax,
        rirTarget: item.rirTarget,
        restSeconds: item.restSeconds,
      })),
    })),
  };
}

export function currentWorkoutPayload(session: NonNullable<Awaited<ReturnType<typeof getCurrentWorkoutSession>>>) {
  return {
    status: session.status,
    startedAt: session.startedAt,
    day: session.workoutDay ? { dayNumber: session.workoutDay.dayNumber, name: session.workoutDay.name } : null,
    exercises: session.exerciseLogs.map((log) => ({
      order: log.order,
      name: log.exercise.name,
      prescribedSets: session.workoutDay?.exercises.find((item) => item.order === log.order)?.sets ?? null,
      sets: log.setLogs.map((set) => ({ setNumber: set.setNumber, weightKg: set.weightKg, reps: set.reps, rir: set.rir })),
    })),
  };
}

export async function getMemberWorkoutPayload(userId: string, gymId: string | null) {
  const [program, current, history] = await Promise.all([
    getActiveWorkoutProgram(userId, gymId),
    getCurrentWorkoutSession(userId, gymId),
    getRecentWorkoutHistory(userId, 5, gymId),
  ]);
  return {
    program: program ? workoutProgramPayload(program) : null,
    current: current ? currentWorkoutPayload(current) : null,
    recent: history,
  };
}

export async function getMemberNutritionPayload(userId: string, gymId: string | null) {
  const plan = await getActiveNutritionPlan(userId, gymId);
  if (!plan) return null;
  return {
    name: plan.name,
    target: {
      calories: plan.target.calories,
      proteinGrams: plan.target.proteinGrams,
      carbsGrams: plan.target.carbsGrams,
      fatGrams: plan.target.fatGrams,
    },
    meals: plan.meals.map((meal) => ({
      order: meal.order,
      name: meal.name,
      mealType: meal.mealType,
      items: meal.items.map((item) => ({
        order: item.order,
        name: item.food.name,
        nameAr: item.food.nameAr,
        quantityGrams: item.quantityGrams,
        calories: item.calories,
        proteinGrams: item.proteinGrams,
      })),
    })),
  };
}

export async function getMemberProgressPayload(userId: string) {
  const [summary, measurements, latestDecision, checkIn] = await Promise.all([
    getProgressSummary(userId),
    getRecentMeasurements(userId, 12),
    getLatestProgressDecision(userId),
    getCheckInStatus(userId),
  ]);
  return { summary, measurements: measurements.reverse(), latestDecision, checkIn };
}

export async function getMemberPhotoMetadata(userId: string) {
  const sets = await prisma.progressPhotoSet.findMany({
    where: { userId },
    orderBy: { capturedAt: "desc" },
    take: 24,
    select: {
      id: true,
      capturedAt: true,
      completedAt: true,
      analysis: {
        select: {
          status: true,
          overallSummary: true,
          comparisonSummary: true,
          confidenceLabel: true,
        },
      },
      photos: { select: { view: true } },
    },
  });
  return sets.map((set) => ({
    photoSetRef: set.id,
    capturedAt: set.capturedAt,
    completedAt: set.completedAt,
    views: set.photos.map((photo) => photo.view),
    analysisStatus: set.analysis?.status ?? PhotoAnalysisStatus.PENDING,
    analysisSummary: set.analysis?.status === PhotoAnalysisStatus.COMPLETED ? set.analysis.overallSummary : null,
    comparisonSummary: set.analysis?.status === PhotoAnalysisStatus.COMPLETED ? set.analysis.comparisonSummary : null,
    confidenceLabel: set.analysis?.status === PhotoAnalysisStatus.COMPLETED ? set.analysis.confidenceLabel : null,
  }));
}

export async function getMemberHomePayload(userId: string, gymId: string | null) {
  const [identity, workout, targets, progress, checkIn, approvals, photos] = await Promise.all([
    getMemberIdentityPayload(userId, gymId),
    getMemberWorkoutPayload(userId, gymId),
    getNutritionTargets(userId, gymId),
    getProgressSummary(userId),
    getCheckInStatus(userId),
    getPendingApprovalsForMember(userId, gymId ?? undefined),
    getLatestPhotoAnalysisSummary(userId),
  ]);
  return {
    greeting: identity?.displayName ?? "عضو",
    coach: identity?.coach ?? { displayName: "AI Coach" },
    branding: identity?.branding,
    workout: workout.current ?? (workout.program ? { status: "READY", program: workout.program.name, days: workout.program.days.map((day) => ({ dayNumber: day.dayNumber, name: day.name })) } : null),
    nutritionTarget: targets ? { calories: targets.calories, proteinGrams: targets.proteinGrams } : null,
    weight: progress ? { currentKg: progress.currentWeightKg, trend: progress.trend, totalChangeKg: progress.totalChangeKg } : null,
    checkIn: { draft: checkIn.draft ? { currentStep: checkIn.draft.currentStep } : null, latestStatus: checkIn.latest?.status ?? null },
    pendingReview: approvals[0] ? { type: approvals[0].type, status: approvals[0].status, createdAt: approvals[0].createdAt } : null,
    photoProgress: photos,
  };
}
