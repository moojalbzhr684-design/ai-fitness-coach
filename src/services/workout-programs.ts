import {
  MembershipStatus,
  OnboardingStep,
  WorkoutProgramStatus,
  WorkoutSessionStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { generateWorkoutProgram } from "../workout/generator.js";
import type { PrescriptionExerciseMetadata } from "../workout/types.js";
import { getGymWorkoutPreferences } from "./gym-exercises.js";

export class WorkoutProgramError extends Error {
  constructor(
    message: string,
    public readonly code: "PROFILE_INCOMPLETE" | "GYM_SELECTION_REQUIRED" | "INVALID_GYM" | "EXERCISE_UNAVAILABLE" = "PROFILE_INCOMPLETE",
  ) {
    super(message);
    this.name = "WorkoutProgramError";
  }
}
const programInclude = {
  days: {
    orderBy: { dayNumber: "asc" as const },
    include: {
      exercises: {
        orderBy: { order: "asc" as const },
        include: { exercise: true },
      },
    },
  },
} as const;

export async function getActiveWorkoutProgram(userId: string) {
  return prisma.workoutProgram.findFirst({
    where: { userId, status: WorkoutProgramStatus.ACTIVE },
    include: programInclude,
    orderBy: { startedAt: "desc" },
  });
}

export async function getWorkoutDay(userId: string, dayId: string) {
  return prisma.workoutDay.findFirst({
    where: {
      id: dayId,
      program: { userId, status: WorkoutProgramStatus.ACTIVE },
    },
    include: {
      program: true,
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: true },
      },
    },
  });
}

export async function getWorkoutProgress(userId: string, exerciseId: string) {
  return prisma.exerciseLog.findMany({
    where: {
      exerciseId,
      workoutSession: { userId, status: WorkoutSessionStatus.COMPLETED },
    },
    include: {
      setLogs: { where: { isWarmup: false }, orderBy: { setNumber: "asc" } },
      workoutSession: { select: { completedAt: true } },
    },
    orderBy: { workoutSession: { completedAt: "desc" } },
    take: 5,
  });
}

export async function generateInitialWorkoutProgram(userId: string, requestedGymId?: string) {
  const [user, exercises] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        gymMemberships: {
          where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.exercise.findMany({ where: { isActive: true } }),
  ]);

  if (!user || user.onboardingStep !== OnboardingStep.COMPLETE || !user.profile) {
    throw new WorkoutProgramError("Complete onboarding before generating a workout program");
  }
  const { experienceLevel, goal, trainingDaysPerWeek, trainingPlace, sessionMinutes } = user.profile;
  if (!experienceLevel || !goal || trainingDaysPerWeek === null || !trainingPlace || sessionMinutes === null) {
    throw new WorkoutProgramError("Workout profile fields are incomplete");
  }
  if (!requestedGymId && user.gymMemberships.length > 1) {
    throw new WorkoutProgramError("Select a gym before generating a workout program", "GYM_SELECTION_REQUIRED");
  }
  const membership = requestedGymId
    ? user.gymMemberships.find((item) => item.gymId === requestedGymId)
    : user.gymMemberships[0];
  if (requestedGymId && !membership) {
    throw new WorkoutProgramError("The selected gym is outside the user's active memberships", "INVALID_GYM");
  }
  const gymId = membership?.gymId ?? null;
  const preferences = gymId ? await getGymWorkoutPreferences(gymId, userId) : undefined;

  const metadata = new Map<string, PrescriptionExerciseMetadata>(
    exercises.map((item) => [item.slug, {
      exerciseType: item.exerciseType,
      equipment: item.equipment,
      movementPattern: item.movementPattern,
      primaryMuscle: item.primaryMuscle,
    }]),
  );
  const generated = generateWorkoutProgram(
    { experienceLevel, goal, trainingDaysPerWeek, trainingPlace, sessionMinutes },
    metadata,
    preferences,
  );
  const exerciseIds = new Map(exercises.map((item) => [item.slug, item.id]));
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.workoutProgram.updateMany({
      where: { userId, status: WorkoutProgramStatus.ACTIVE },
      data: { status: WorkoutProgramStatus.ARCHIVED, endedAt: now },
    });

    return transaction.workoutProgram.create({
      data: {
        userId,
        gymId,
        name: generated.name,
        split: generated.split,
        status: WorkoutProgramStatus.ACTIVE,
        trainingDaysPerWeek: generated.trainingDaysPerWeek,
        startedAt: now,
        days: {
          create: generated.days.map((day) => ({
            dayNumber: day.dayNumber,
            name: day.name,
            notes: day.notes,
            exercises: {
              create: day.exercises.map((item, index) => {
                const exerciseId = exerciseIds.get(item.slug);
                if (!exerciseId) throw new WorkoutProgramError(`Exercise not found: ${item.slug}`, "EXERCISE_UNAVAILABLE");
                return {
                  exerciseId,
                  order: index + 1,
                  sets: item.sets,
                  repMin: item.repMin,
                  repMax: item.repMax,
                  restSeconds: item.restSeconds,
                  rirTarget: item.rirTarget,
                  startingWeightKg: item.startingWeightKg,
                  notes: item.notes ?? null,
                };
              }),
            },
          })),
        },
      },
      include: programInclude,
    });
  });
}
