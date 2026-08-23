import {
  CheckInStatus,
  CheckInStep,
  MembershipStatus,
  NutritionPlanStatus,
  OnboardingStep,
  WorkoutSessionStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  calculateBmr,
  minimumSafeCalorieTarget,
} from "../nutrition/calculator.js";
import { evaluateProgress } from "../progress/evaluator.js";
import { RECENT_CHECKIN_WARNING_DAYS } from "../progress/rules.js";
import { calculateWeightTrend } from "../progress/trend.js";
import {
  validateAverageDailySteps,
  validateAverageSleepHours,
  validateCompletedCheckIn,
  validateEnergyRating,
  validateHungerRating,
  validateNotes,
  validateNutritionAdherencePct,
  validateWaistCm,
  validateWeightKg,
  validateWorkoutsCompleted,
} from "../progress/validation.js";
import { buildAgentDecisionRecord, progressAuditEvents } from "./progress-decisions.js";

const DAY_MS = 86_400_000;

export class CheckInError extends Error {
  constructor(
    public readonly code:
      | "USER_NOT_READY"
      | "RECENT_CHECKIN"
      | "NO_DRAFT"
      | "STALE_STEP"
      | "INVALID_VALUE",
    message: string,
  ) {
    super(message);
    this.name = "CheckInError";
  }
}

export async function getDraftCheckIn(userId: string) {
  return prisma.weeklyCheckIn.findFirst({
    where: { userId, status: CheckInStatus.DRAFT },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrCreateDraftCheckIn(userId: string) {
  const existing = await getDraftCheckIn(userId);
  if (existing) return { checkIn: existing, resumed: true };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      gymMemberships: {
        where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      weeklyCheckIns: {
        where: { status: CheckInStatus.EVALUATED },
        orderBy: { evaluatedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!user || user.onboardingStep !== OnboardingStep.COMPLETE || !user.profile) {
    throw new CheckInError("USER_NOT_READY", "Complete onboarding before starting a check-in");
  }
  const latest = user.weeklyCheckIns[0];
  if (latest?.evaluatedAt
    && Date.now() - latest.evaluatedAt.getTime() < RECENT_CHECKIN_WARNING_DAYS * DAY_MS) {
    throw new CheckInError("RECENT_CHECKIN", "A completed check-in exists within the last five days");
  }
  const checkIn = await prisma.weeklyCheckIn.create({
    data: {
      userId,
      gymId: user.gymMemberships[0]?.gymId ?? null,
      status: CheckInStatus.DRAFT,
      currentStep: CheckInStep.WEIGHT,
    },
  });
  return { checkIn, resumed: false };
}

type CheckInAnswerData = {
  weightKg?: number;
  waistCm?: number | null;
  nutritionAdherencePct?: number;
  workoutsCompleted?: number;
  averageDailySteps?: number | null;
  averageSleepHours?: number;
  hungerRating?: number;
  energyRating?: number;
  notes?: string | null;
};

function validateAnswer(expectedStep: CheckInStep, data: CheckInAnswerData): void {
  try {
    switch (expectedStep) {
      case CheckInStep.WEIGHT:
        if (data.weightKg === undefined) throw new RangeError("Weight is required");
        validateWeightKg(data.weightKg);
        break;
      case CheckInStep.WAIST:
        validateWaistCm(data.waistCm ?? null);
        break;
      case CheckInStep.NUTRITION_ADHERENCE:
        if (data.nutritionAdherencePct === undefined) throw new RangeError("Adherence is required");
        validateNutritionAdherencePct(data.nutritionAdherencePct);
        break;
      case CheckInStep.WORKOUTS_COMPLETED:
        if (data.workoutsCompleted === undefined) throw new RangeError("Workouts are required");
        validateWorkoutsCompleted(data.workoutsCompleted);
        break;
      case CheckInStep.STEPS:
        validateAverageDailySteps(data.averageDailySteps ?? null);
        break;
      case CheckInStep.SLEEP:
        if (data.averageSleepHours === undefined) throw new RangeError("Sleep is required");
        validateAverageSleepHours(data.averageSleepHours);
        break;
      case CheckInStep.HUNGER:
        if (data.hungerRating === undefined) throw new RangeError("Hunger is required");
        validateHungerRating(data.hungerRating);
        break;
      case CheckInStep.ENERGY:
        if (data.energyRating === undefined) throw new RangeError("Energy is required");
        validateEnergyRating(data.energyRating);
        break;
      case CheckInStep.NOTES:
        validateNotes(data.notes ?? null);
        break;
      case CheckInStep.COMPLETE:
        throw new RangeError("Check-in is already complete");
    }
  } catch (error) {
    if (error instanceof RangeError) throw new CheckInError("INVALID_VALUE", error.message);
    throw error;
  }
}

export async function saveCheckInAnswer(params: {
  userId: string;
  expectedStep: CheckInStep;
  nextStep: CheckInStep;
  data: CheckInAnswerData;
}) {
  validateAnswer(params.expectedStep, params.data);
  const updated = await prisma.weeklyCheckIn.updateMany({
    where: {
      userId: params.userId,
      status: CheckInStatus.DRAFT,
      currentStep: params.expectedStep,
    },
    data: { ...params.data, currentStep: params.nextStep },
  });
  if (updated.count !== 1) throw new CheckInError("STALE_STEP", "Draft step changed or is unavailable");
  return getDraftCheckIn(params.userId);
}

export async function completeDraftCheckIn(userId: string) {
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const checkIn = await transaction.weeklyCheckIn.findFirst({
      where: { userId, status: CheckInStatus.DRAFT, currentStep: CheckInStep.COMPLETE },
    });
    if (!checkIn) throw new CheckInError("NO_DRAFT", "No completed draft is available");
    if (checkIn.weightKg === null || checkIn.nutritionAdherencePct === null
      || checkIn.workoutsCompleted === null || checkIn.averageSleepHours === null
      || checkIn.hungerRating === null || checkIn.energyRating === null) {
      throw new CheckInError("INVALID_VALUE", "Required check-in fields are missing");
    }
    validateCompletedCheckIn({
      weightKg: checkIn.weightKg,
      waistCm: checkIn.waistCm,
      nutritionAdherencePct: checkIn.nutritionAdherencePct,
      workoutsCompleted: checkIn.workoutsCompleted,
      averageDailySteps: checkIn.averageDailySteps,
      averageSleepHours: checkIn.averageSleepHours,
      hungerRating: checkIn.hungerRating,
      energyRating: checkIn.energyRating,
      notes: checkIn.notes,
    });
    const user = await transaction.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        gymMemberships: checkIn.gymId
          ? { where: { gymId: checkIn.gymId, status: MembershipStatus.ACTIVE }, take: 1 }
          : false,
      },
    });
    if (!user?.profile || !user.profile.goal || !user.profile.sex
      || user.profile.age === null || user.profile.heightCm === null) {
      throw new CheckInError("USER_NOT_READY", "Progress profile fields are incomplete");
    }
    const effectiveGymId = checkIn.gymId && user.gymMemberships[0] ? checkIn.gymId : null;
    const submittedAt = new Date();
    const previousCheckIn = await transaction.weeklyCheckIn.findFirst({
      where: {
        userId,
        status: CheckInStatus.EVALUATED,
        submittedAt: { not: null, lt: submittedAt },
      },
      select: { submittedAt: true },
      orderBy: { submittedAt: "desc" },
    });
    const sevenDaysAgo = submittedAt.getTime() - 7 * DAY_MS;
    const workoutPeriodStart = new Date(Math.max(
      sevenDaysAgo,
      previousCheckIn?.submittedAt?.getTime() ?? sevenDaysAgo,
    ));
    const trackedWorkoutsCompleted = await transaction.workoutSession.count({
      where: {
        userId,
        status: WorkoutSessionStatus.COMPLETED,
        completedAt: { gte: workoutPeriodStart, lte: submittedAt },
      },
    });
    await transaction.weeklyCheckIn.update({
      where: { id: checkIn.id },
      data: {
        gymId: effectiveGymId,
        status: CheckInStatus.SUBMITTED,
        submittedAt,
        trackedWorkoutsCompleted,
      },
    });
    const measurement = await transaction.bodyMeasurement.create({
      data: {
        userId,
        gymId: effectiveGymId,
        weightKg: checkIn.weightKg,
        waistCm: checkIn.waistCm,
        measuredAt: submittedAt,
        source: "WEEKLY_CHECKIN",
      },
    });
    await transaction.userProfile.update({
      where: { userId },
      data: { weightKg: checkIn.weightKg },
    });
    const measurements = await transaction.bodyMeasurement.findMany({
      where: { userId, measuredAt: { gte: new Date(submittedAt.getTime() - 21 * DAY_MS) } },
      select: { weightKg: true, measuredAt: true },
      orderBy: { measuredAt: "asc" },
    });
    const trend = calculateWeightTrend(measurements);
    const activeNutritionPlan = await transaction.nutritionPlan.findFirst({
      where: { userId, status: NutritionPlanStatus.ACTIVE },
      include: { target: true },
      orderBy: { startedAt: "desc" },
    });
    const bmr = calculateBmr({
      age: user.profile.age,
      sex: user.profile.sex,
      heightCm: user.profile.heightCm,
      weightKg: checkIn.weightKg,
    });
    const currentCalories = activeNutritionPlan?.target.calories ?? null;
    const evaluationResult = evaluateProgress({
      goal: user.profile.goal,
      trend,
      nutritionAdherencePct: checkIn.nutritionAdherencePct,
      averageDailySteps: checkIn.averageDailySteps,
      averageSleepHours: checkIn.averageSleepHours,
      hungerRating: checkIn.hungerRating,
      energyRating: checkIn.energyRating,
      currentCalories,
      minimumSafeCalories: minimumSafeCalorieTarget(bmr),
      hasGym: effectiveGymId !== null,
    });
    const evaluation = await transaction.progressEvaluation.create({
      data: {
        checkInId: checkIn.id,
        userId,
        gymId: effectiveGymId,
        action: evaluationResult.action,
        weightTrendKgPerWeek: evaluationResult.weightTrendKgPerWeek,
        weightTrendPercentPerWeek: evaluationResult.weightTrendPercentPerWeek,
        recommendedCaloriesDelta: evaluationResult.recommendedCaloriesDelta,
        recommendedStepsDelta: evaluationResult.recommendedStepsDelta,
        requiresCoachApproval: evaluationResult.requiresCoachApproval,
        reasonCodes: evaluationResult.reasonCodes,
        summary: evaluationResult.summary,
      },
    });
    const agentDecision = buildAgentDecisionRecord(
      evaluationResult,
      currentCalories,
      checkIn.averageDailySteps,
    );
    await transaction.agentDecision.create({
      data: {
        userId,
        gymId: effectiveGymId,
        ...agentDecision,
      },
    });
    const auditEvents = progressAuditEvents(checkIn.id, evaluation.id, measurement.id);
    await transaction.auditLog.createMany({
      data: auditEvents.map((event) => ({
        actorUserId: userId,
        gymId: effectiveGymId,
        ...event,
        metadata: { source: "TELEGRAM_CHECKIN" },
      })),
    });
    const evaluatedAt = new Date();
    const completed = await transaction.weeklyCheckIn.update({
      where: { id: checkIn.id },
      data: { status: CheckInStatus.EVALUATED, evaluatedAt },
    });
    return { checkIn: completed, evaluation };
  });
}

export async function logManualWeight(userId: string, weightKg: number) {
  try {
    validateWeightKg(weightKg);
  } catch (error) {
    throw new CheckInError("INVALID_VALUE", error instanceof Error ? error.message : "Invalid weight");
  }
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const user = await transaction.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        gymMemberships: {
          where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!user?.profile) throw new CheckInError("USER_NOT_READY", "User profile is unavailable");
    const gymId = user.gymMemberships[0]?.gymId ?? null;
    const measurement = await transaction.bodyMeasurement.create({
      data: { userId, gymId, weightKg, measuredAt: new Date(), source: "MANUAL" },
    });
    await transaction.userProfile.update({ where: { userId }, data: { weightKg } });
    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        gymId,
        action: "BODY_WEIGHT_LOGGED",
        targetType: "BodyMeasurement",
        targetId: measurement.id,
        metadata: { source: "MANUAL" },
      },
    });
    return measurement;
  });
}
