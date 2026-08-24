import {
  WorkoutProgramStatus,
  WorkoutSessionStatus,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { recommendDoubleProgression } from "../workout/progression.js";
import type { ProgressionRecommendation } from "../workout/types.js";

export class WorkoutSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkoutSessionError";
  }
}
const currentSessionInclude = {
  workoutDay: {
    include: {
      exercises: {
        orderBy: { order: "asc" as const },
        include: { exercise: true },
      },
    },
  },
  exerciseLogs: {
    orderBy: { order: "asc" as const },
    include: {
      exercise: true,
      setLogs: { orderBy: { setNumber: "asc" as const } },
    },
  },
} as const;

export async function getCurrentWorkoutSession(userId: string) {
  return prisma.workoutSession.findFirst({
    where: { userId, status: WorkoutSessionStatus.IN_PROGRESS },
    include: currentSessionInclude,
    orderBy: { startedAt: "desc" },
  });
}

export async function getRecentWorkoutHistory(userId: string, limit = 5) {
  const take = Math.min(5, Math.max(1, Math.trunc(limit)));
  return prisma.workoutSession.findMany({
    where: { userId, status: WorkoutSessionStatus.COMPLETED },
    orderBy: { completedAt: "desc" },
    take,
    select: {
      id: true,
      completedAt: true,
      durationMinutes: true,
      workoutDay: { select: { dayNumber: true, name: true } },
      exerciseLogs: {
        orderBy: { order: "asc" },
        select: {
          order: true,
          exercise: { select: { id: true, name: true } },
          setLogs: {
            where: { isWarmup: false },
            orderBy: { setNumber: "asc" },
            select: { setNumber: true, weightKg: true, reps: true, rir: true },
          },
        },
      },
    },
  });
}

export async function startWorkoutSession(userId: string, workoutDayId: string) {
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const day = await transaction.workoutDay.findFirst({
      where: {
        id: workoutDayId,
        program: { userId, status: WorkoutProgramStatus.ACTIVE },
      },
      include: {
        program: true,
        exercises: { orderBy: { order: "asc" } },
      },
    });
    if (!day) throw new WorkoutSessionError("Workout day does not belong to an active user program");

    const existing = await transaction.workoutSession.findFirst({
      where: { userId, status: WorkoutSessionStatus.IN_PROGRESS },
      select: { id: true },
    });
    if (existing) throw new WorkoutSessionError("An in-progress workout already exists");

    return transaction.workoutSession.create({
      data: {
        userId,
        gymId: day.program.gymId,
        programId: day.programId,
        workoutDayId: day.id,
        status: WorkoutSessionStatus.IN_PROGRESS,
        startedAt: new Date(),
        exerciseLogs: {
          create: day.exercises.map((item) => ({
            exerciseId: item.exerciseId,
            order: item.order,
          })),
        },
      },
      include: currentSessionInclude,
    });
  });
}

export interface LogExerciseSetInput {
  userId: string;
  exerciseNumber: number;
  setNumber: number;
  weightKg: number | null;
  reps: number;
  rir: number | null;
  isWarmup?: boolean;
}

function validateSetInput(input: LogExerciseSetInput): void {
  if (!Number.isInteger(input.exerciseNumber) || input.exerciseNumber < 1) {
    throw new WorkoutSessionError("Exercise number must be a positive integer");
  }
  if (!Number.isInteger(input.setNumber) || input.setNumber < 1) {
    throw new WorkoutSessionError("Set number must be a positive integer");
  }
  if (!Number.isInteger(input.reps) || input.reps < 1 || input.reps > 100) {
    throw new WorkoutSessionError("Reps must be an integer from 1 to 100");
  }
  if (input.weightKg !== null && (!Number.isFinite(input.weightKg) || input.weightKg < 0 || input.weightKg > 1_000)) {
    throw new WorkoutSessionError("Weight must be from 0 to 1000 kg");
  }
  if (input.rir !== null && (!Number.isInteger(input.rir) || input.rir < 0 || input.rir > 5)) {
    throw new WorkoutSessionError("RIR must be an integer from 0 to 5");
  }
}

export async function logExerciseSet(input: LogExerciseSetInput) {
  validateSetInput(input);
  const session = await getCurrentWorkoutSession(input.userId);
  if (!session || !session.workoutDay) {
    throw new WorkoutSessionError("No in-progress workout found");
  }
  const exerciseLog = session.exerciseLogs.find((item) => item.order === input.exerciseNumber);
  const prescription = session.workoutDay.exercises.find(
    (item) => item.order === input.exerciseNumber && item.exerciseId === exerciseLog?.exerciseId,
  );
  if (!exerciseLog || !prescription) {
    throw new WorkoutSessionError("Exercise number is not part of the current workout");
  }
  if (input.setNumber > prescription.sets) {
    throw new WorkoutSessionError(`Set number cannot exceed ${prescription.sets}`);
  }

  const setLog = await prisma.setLog.upsert({
    where: {
      exerciseLogId_setNumber: { exerciseLogId: exerciseLog.id, setNumber: input.setNumber },
    },
    update: {
      weightKg: input.weightKg,
      reps: input.reps,
      rir: input.rir,
      isWarmup: input.isWarmup ?? false,
      completedAt: new Date(),
    },
    create: {
      exerciseLogId: exerciseLog.id,
      setNumber: input.setNumber,
      weightKg: input.weightKg,
      reps: input.reps,
      rir: input.rir,
      isWarmup: input.isWarmup ?? false,
    },
  });
  return { setLog, exercise: exerciseLog.exercise };
}

export interface CompletedExerciseSummary {
  exercise: { id: string; name: string };
  sets: Array<{ weightKg: number | null; reps: number; rir: number | null; isWarmup: boolean }>;
  recommendation: ProgressionRecommendation;
}

export async function completeWorkoutSession(
  userId: string,
  userNotes?: string,
): Promise<{ sessionId: string; durationMinutes: number | null; exercises: CompletedExerciseSummary[] }> {
  const session = await getCurrentWorkoutSession(userId);
  if (!session || !session.workoutDay) {
    throw new WorkoutSessionError("No in-progress workout found");
  }
  const completedAt = new Date();
  const durationMinutes = session.startedAt
    ? Math.max(0, Math.round((completedAt.getTime() - session.startedAt.getTime()) / 60_000))
    : null;
  const updated = await prisma.workoutSession.updateMany({
    where: { id: session.id, userId, status: WorkoutSessionStatus.IN_PROGRESS },
    data: {
      status: WorkoutSessionStatus.COMPLETED,
      completedAt,
      durationMinutes,
      ...(userNotes !== undefined ? { userNotes } : {}),
    },
  });
  if (updated.count !== 1) throw new WorkoutSessionError("Workout was already completed");

  const exercises = session.exerciseLogs.map((log): CompletedExerciseSummary => {
    const prescription = session.workoutDay!.exercises.find(
      (item) => item.order === log.order && item.exerciseId === log.exerciseId,
    );
    if (!prescription) throw new WorkoutSessionError("Workout prescription is unavailable");
    const sets = log.setLogs.map((set) => ({
      weightKg: set.weightKg,
      reps: set.reps,
      rir: set.rir,
      isWarmup: set.isWarmup,
    }));
    return {
      exercise: { id: log.exercise.id, name: log.exercise.name },
      sets,
      recommendation: recommendDoubleProgression(
        {
          sets: prescription.sets,
          repMin: prescription.repMin,
          repMax: prescription.repMax,
          rirTarget: prescription.rirTarget,
          primaryMuscle: log.exercise.primaryMuscle,
          equipment: log.exercise.equipment,
        },
        sets,
      ),
    };
  });
  return { sessionId: session.id, durationMinutes, exercises };
}
