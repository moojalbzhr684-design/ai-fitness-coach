import {
  ActivityLevel,
  ExperienceLevel,
  Goal,
  GymRole,
  MembershipStatus,
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

    await transaction.userProfile.upsert({
      where: { userId: params.userId },
      update: params.profile,
      create: { userId: params.userId, ...params.profile },
    });

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
