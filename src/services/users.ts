import {
  ActivityLevel,
  CheckInStatus,
  ExperienceLevel,
  Goal,
  GymRole,
  IdentityProvider,
  MembershipStatus,
  NutritionPlanStatus,
  OnboardingStep,
  Prisma,
  PhotoAnalysisStatus,
  Sex,
  SystemRole,
  TrainingPlace,
  WorkoutProgramStatus,
  WorkoutSessionStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

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

  return prisma.$transaction(async (tx) => {
    const database = tx as unknown as typeof prisma;
    const user = await database.user.upsert({
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
    const providerKey = { provider: IdentityProvider.TELEGRAM, providerSubject: input.telegramId.toString() };
    const existingIdentity = await database.userIdentity.findUnique({
      where: { provider_providerSubject: providerKey },
      select: { id: true, userId: true },
    });
    if (existingIdentity && existingIdentity.userId !== user.id) {
      throw new Error("Telegram identity conflict");
    }
    if (existingIdentity) {
      await database.userIdentity.update({ where: { id: existingIdentity.id }, data: { isVerified: true, lastUsedAt: new Date() } });
    } else {
      await database.userIdentity.create({ data: {
        userId: user.id,
        ...providerKey,
        isVerified: true,
        lastUsedAt: new Date(),
      } });
    }
    return user;
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
        include: { gym: { include: { settings: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function getUserProfileById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true,
      profile: {
        select: {
          age: true,
          sex: true,
          heightCm: true,
          weightKg: true,
          activityLevel: true,
          experienceLevel: true,
          goal: true,
          trainingDaysPerWeek: true,
          sessionMinutes: true,
          trainingPlace: true,
          mealsPerDay: true,
          weeklyFoodBudgetIqd: true,
          foodPreferences: true,
          dislikedFoods: true,
          allergies: true,
          dietaryRestrictions: true,
        },
      },
    },
  });
}

export async function getCoachContext(userId: string, gymId?: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      gymMemberships: {
        where: {
          status: MembershipStatus.ACTIVE,
          gym: { isActive: true },
          ...(gymId ? { gymId } : {}),
        },
        include: { gym: { include: { settings: true } } },
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
      progressPhotoSets: {
        where: {
          completedAt: { not: null },
          analysis: { status: PhotoAnalysisStatus.COMPLETED },
        },
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: {
          capturedAt: true,
          analysis: {
            select: { overallSummary: true, comparisonSummary: true },
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

export const memberProfileUpdateSchema = z.object({
  heightCm: z.number().finite().min(100).max(250).optional(),
  activityLevel: z.enum(ActivityLevel).optional(),
  experienceLevel: z.enum(ExperienceLevel).optional(),
  goal: z.enum(Goal).optional(),
  trainingDaysPerWeek: z.number().int().min(1).max(7).optional(),
  sessionMinutes: z.number().int().min(20).max(180).optional(),
  trainingPlace: z.enum(TrainingPlace).optional(),
  mealsPerDay: z.number().int().min(2).max(6).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one supported field is required");

export async function updateMemberProfile(userId: string, input: unknown) {
  const data = Object.fromEntries(
    Object.entries(memberProfileUpdateSchema.parse(input)).filter((entry) => entry[1] !== undefined),
  ) as Prisma.UserProfileUpdateManyMutationInput;
  const updated = await prisma.userProfile.updateMany({ where: { userId }, data });
  if (updated.count !== 1) throw new Error("Member profile is unavailable");
  return prisma.userProfile.findUnique({ where: { userId } });
}
