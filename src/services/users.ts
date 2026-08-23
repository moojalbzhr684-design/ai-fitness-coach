import {
  ActivityLevel,
  CheckInStatus,
  ExperienceLevel,
  Goal,
  GymRole,
  MembershipStatus,
  NutritionPlanStatus,
  OnboardingStep,
  Sex,
  SystemRole,
  TrainingPlace,
  WorkoutProgramStatus,
  WorkoutSessionStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export interface TelegramUserInput {
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface OnboardingProfileUpdate {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
  experienceLevel?: ExperienceLevel;
  goal?: Goal;
  trainingDaysPerWeek?: number;
  sessionMinutes?: number;
  trainingPlace?: TrainingPlace;
  mealsPerDay?: number;
  weeklyFoodBudgetIqd?: number;
}

export async function upsertTelegramUser(
  input: TelegramUserInput,
  superAdminTelegramId?: string,
) {
  const isSuperAdmin = superAdminTelegramId === input.telegramId.toString();
  const identity = {
    telegramUsername: input.username ?? null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
  };

  return prisma.user.upsert({
    where: { telegramId: input.telegramId },
    update: {
      ...identity,
      ...(isSuperAdmin ? { systemRole: SystemRole.SUPER_ADMIN } : {}),
    },
    create: {
      telegramId: input.telegramId,
      ...identity,
      systemRole: isSuperAdmin ? SystemRole.SUPER_ADMIN : SystemRole.USER,
      profile: { create: {} },
    },
    include: { profile: true },
  });
}

export async function findUserByTelegramId(telegramId: bigint) {
  return prisma.user.findUnique({
    where: { telegramId },
    include: { profile: true },
  });
}

export async function saveOnboardingAnswer(params: {
  userId: string;
  expectedStep: OnboardingStep;
  nextStep: OnboardingStep;
  profile: OnboardingProfileUpdate;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Prisma's transaction client is the same model surface without connection methods.
    const transaction = tx as unknown as typeof prisma;
    const transition = await transaction.user.updateMany({
      where: { id: params.userId, onboardingStep: params.expectedStep },
      data: { onboardingStep: params.nextStep },
    });

    if (transition.count !== 1) {
      return false;
    }

    const profile = await transaction.userProfile.upsert({
      where: { userId: params.userId },
      update: params.profile,
      create: { userId: params.userId, ...params.profile },
    });

    if (params.nextStep === OnboardingStep.COMPLETE && profile.weightKg !== null) {
      const existingMeasurement = await transaction.bodyMeasurement.findFirst({
        where: { userId: params.userId },
        select: { id: true },
      });
      if (!existingMeasurement) {
        const measurement = await transaction.bodyMeasurement.create({
          data: {
            userId: params.userId,
            weightKg: profile.weightKg,
            measuredAt: new Date(),
            source: "ONBOARDING",
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: params.userId,
            action: "BODY_WEIGHT_LOGGED",
            targetType: "BodyMeasurement",
            targetId: measurement.id,
            metadata: { source: "ONBOARDING" },
          },
        });
      }
    }

    return true;
  });
}

export async function getUserProfile(telegramId: bigint) {
  return prisma.user.findUnique({
    where: { telegramId },
    include: {
      profile: true,
      gymMemberships: {
        where: {
          status: MembershipStatus.ACTIVE,
          gym: { isActive: true },
        },
        include: { gym: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getCoachContext(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      gymMemberships: {
        where: {
          status: MembershipStatus.ACTIVE,
          gym: { isActive: true },
        },
        include: { gym: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      workoutPrograms: {
        where: { status: WorkoutProgramStatus.ACTIVE },
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          days: {
            orderBy: { dayNumber: "asc" },
            select: { id: true, dayNumber: true, name: true },
          },
        },
      },
      workoutSessions: {
        where: { status: WorkoutSessionStatus.IN_PROGRESS },
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          workoutDay: { select: { id: true, dayNumber: true, name: true } },
          exerciseLogs: {
            orderBy: { order: "asc" },
            select: {
              order: true,
              exercise: { select: { name: true } },
              setLogs: {
                where: { isWarmup: false },
                orderBy: { setNumber: "asc" },
                select: { reps: true, weightKg: true, rir: true },
              },
            },
          },
        },
      },
      nutritionPlans: {
        where: { status: NutritionPlanStatus.ACTIVE },
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          target: true,
          meals: {
            orderBy: { order: "asc" },
            select: {
              order: true,
              name: true,
              items: {
                orderBy: { order: "asc" },
                select: {
                  quantityGrams: true,
                  food: { select: { name: true, nameAr: true } },
                },
              },
            },
          },
        },
      },
      bodyMeasurements: {
        orderBy: { measuredAt: "desc" },
        take: 30,
        select: { weightKg: true, waistCm: true, measuredAt: true },
      },
      weeklyCheckIns: {
        where: { status: CheckInStatus.EVALUATED },
        orderBy: { evaluatedAt: "desc" },
        take: 1,
        include: { evaluation: true },
      },
      agentDecisions: {
        where: { decisionType: "WEEKLY_PROGRESS_REVIEW" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export const profileEnumValues = {
  ActivityLevel,
  ExperienceLevel,
  Goal,
  GymRole,
  MembershipStatus,
  OnboardingStep,
  Sex,
  TrainingPlace,
};
