import { getExerciseSubstitutions } from "../../services/exercises.js";
import { getActiveWorkoutProgram, getWorkoutDay, getWorkoutProgress } from "../../services/workout-programs.js";
import {
  completeWorkoutSession,
  getCurrentWorkoutSession,
  getRecentWorkoutHistory,
  logExerciseSet,
  startWorkoutSession,
} from "../../services/workout-sessions.js";
import { recommendDoubleProgression } from "../../workout/progression.js";
import {
  emptyToolInputSchema,
  exerciseReferenceInputSchema,
  finishWorkoutInputSchema,
  logWorkoutSetInputSchema,
  recentHistoryInputSchema,
  startWorkoutInputSchema,
  workoutDayInputSchema,
} from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

type CurrentSession = NonNullable<Awaited<ReturnType<typeof getCurrentWorkoutSession>>>;
type ActiveProgram = NonNullable<Awaited<ReturnType<typeof getActiveWorkoutProgram>>>;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function resolveSessionExercise(session: CurrentSession, reference: string) {
  const number = Number(reference);
  if (Number.isInteger(number) && number > 0) {
    const found = session.exerciseLogs.filter((log) => log.order === number);
    return { found: found[0] ?? null, options: found };
  }
  const wanted = normalize(reference);
  const exact = session.exerciseLogs.filter((log) => normalize(log.exercise.name) === wanted);
  const candidates = exact.length ? exact : session.exerciseLogs.filter((log) => normalize(log.exercise.name).includes(wanted));
  return { found: candidates.length === 1 ? candidates[0]! : null, options: candidates };
}

function resolveProgramExercise(program: ActiveProgram, reference: string) {
  const number = Number(reference);
  const exercises = program.days.flatMap((day) => day.exercises.map((item) => ({ ...item, dayNumber: day.dayNumber, dayName: day.name })));
  const candidates = Number.isInteger(number) && number > 0
    ? exercises.filter((item) => item.order === number)
    : (() => {
        const wanted = normalize(reference);
        const exact = exercises.filter((item) => normalize(item.exercise.name) === wanted);
        return exact.length ? exact : exercises.filter((item) => normalize(item.exercise.name).includes(wanted));
      })();
  const uniqueIds = new Set(candidates.map((item) => item.exerciseId));
  return { found: uniqueIds.size === 1 ? candidates[0]! : null, options: candidates };
}

function programOutput(program: ActiveProgram) {
  return {
    name: program.name,
    split: program.split,
    trainingDaysPerWeek: program.trainingDaysPerWeek,
    days: program.days.map((day) => ({
      dayNumber: day.dayNumber,
      name: day.name,
      exercises: day.exercises.map((item) => ({
        order: item.order,
        name: item.exercise.name,
        sets: item.sets,
        repRange: `${item.repMin}-${item.repMax}`,
        rirTarget: item.rirTarget,
        restSeconds: item.restSeconds,
      })),
    })),
  };
}

export const workoutTools: AgentToolDefinition[] = [
  {
    name: "get_active_workout_program",
    description: "Read the authenticated user's active workout program and its day/exercise prescriptions.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const program = await getActiveWorkoutProgram(actor.userId, actor.gymId);
      return program ? { status: "found", program: programOutput(program) } : { status: "not_found" };
    },
  },
  {
    name: "get_workout_day",
    description: "Read one numbered day from the authenticated user's active workout program.",
    category: ToolCategory.READ,
    schema: workoutDayInputSchema,
    handler: async (input, { actor }) => {
      const { dayNumber } = workoutDayInputSchema.parse(input);
      const program = await getActiveWorkoutProgram(actor.userId, actor.gymId);
      const day = program?.days.find((item) => item.dayNumber === dayNumber);
      if (!day) return { status: "not_found" };
      const stored = await getWorkoutDay(actor.userId, day.id);
      return stored ? {
        status: "found",
        day: {
          dayNumber: stored.dayNumber,
          name: stored.name,
          notes: stored.notes,
          exercises: stored.exercises.map((item) => ({
            order: item.order,
            name: item.exercise.name,
            sets: item.sets,
            repMin: item.repMin,
            repMax: item.repMax,
            rirTarget: item.rirTarget,
            restSeconds: item.restSeconds,
          })),
        },
      } : { status: "not_found" };
    },
  },
  {
    name: "get_current_workout_session",
    description: "Read only the authenticated user's current in-progress workout session.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const session = await getCurrentWorkoutSession(actor.userId, actor.gymId);
      return session ? {
        status: "in_progress",
        dayName: session.workoutDay?.name ?? null,
        startedAt: session.startedAt,
        exercises: session.exerciseLogs.map((log) => ({
          order: log.order,
          name: log.exercise.name,
          sets: log.setLogs.map((set) => ({ setNumber: set.setNumber, weightKg: set.weightKg, reps: set.reps, rir: set.rir })),
        })),
      } : { status: "none" };
    },
  },
  {
    name: "get_recent_workout_history",
    description: "Read up to five recent completed workout sessions for the authenticated user.",
    category: ToolCategory.READ,
    schema: recentHistoryInputSchema,
    handler: async (input, { actor }) => {
      const history = await getRecentWorkoutHistory(actor.userId, recentHistoryInputSchema.parse(input).limit, actor.gymId);
      return history.map((session) => ({
        completedAt: session.completedAt,
        durationMinutes: session.durationMinutes,
        workoutDay: session.workoutDay,
        exercises: session.exerciseLogs.map((log) => ({
          order: log.order,
          name: log.exercise.name,
          sets: log.setLogs,
        })),
      }));
    },
  },
  {
    name: "get_exercise_progress",
    description: "Read recent completed-set history for an exercise that exists in the authenticated user's active program.",
    category: ToolCategory.READ,
    schema: exerciseReferenceInputSchema,
    handler: async (input, { actor }) => {
      const { exerciseReference } = exerciseReferenceInputSchema.parse(input);
      const program = await getActiveWorkoutProgram(actor.userId, actor.gymId);
      if (!program) return { status: "no_active_program" };
      const resolved = resolveProgramExercise(program, exerciseReference);
      if (!resolved.found) return { status: "clarification_required", options: [...new Set(resolved.options.map((item) => item.exercise.name))] };
      const history = await getWorkoutProgress(actor.userId, resolved.found.exerciseId);
      return {
        status: "found",
        exercise: resolved.found.exercise.name,
        history: history.map((entry) => ({
          completedAt: entry.workoutSession.completedAt,
          sets: entry.setLogs.map((set) => ({ setNumber: set.setNumber, weightKg: set.weightKg, reps: set.reps, rir: set.rir })),
        })),
      };
    },
  },
  {
    name: "get_progression_recommendation",
    description: "Calculate a deterministic double-progression recommendation from stored completed sets for an active-program exercise.",
    category: ToolCategory.READ,
    schema: exerciseReferenceInputSchema,
    handler: async (input, { actor }) => {
      const { exerciseReference } = exerciseReferenceInputSchema.parse(input);
      const program = await getActiveWorkoutProgram(actor.userId, actor.gymId);
      if (!program) return { status: "no_active_program" };
      const resolved = resolveProgramExercise(program, exerciseReference);
      if (!resolved.found) return { status: "clarification_required", options: [...new Set(resolved.options.map((item) => item.exercise.name))] };
      const history = await getWorkoutProgress(actor.userId, resolved.found.exerciseId);
      const latestSets = history[0]?.setLogs ?? [];
      return {
        status: "found",
        exercise: resolved.found.exercise.name,
        recommendation: recommendDoubleProgression({
          sets: resolved.found.sets,
          repMin: resolved.found.repMin,
          repMax: resolved.found.repMax,
          rirTarget: resolved.found.rirTarget,
          primaryMuscle: resolved.found.exercise.primaryMuscle,
          equipment: resolved.found.exercise.equipment,
        }, latestSets),
      };
    },
  },
  {
    name: "find_exercise_substitutions",
    description: "Find stored exercise substitutions for an exercise in the authenticated user's current or active workout context.",
    category: ToolCategory.READ,
    schema: exerciseReferenceInputSchema,
    handler: async (input, { actor }) => {
      const { exerciseReference } = exerciseReferenceInputSchema.parse(input);
      const session = await getCurrentWorkoutSession(actor.userId, actor.gymId);
      const current = session ? resolveSessionExercise(session, exerciseReference) : null;
      let exercise = current?.found?.exercise;
      if (!exercise) {
        const program = await getActiveWorkoutProgram(actor.userId, actor.gymId);
        const resolved = program ? resolveProgramExercise(program, exerciseReference) : null;
        if (!resolved?.found) return { status: "clarification_required", options: resolved?.options.map((item) => item.exercise.name) ?? [] };
        exercise = resolved.found.exercise;
      }
      const substitutions = await getExerciseSubstitutions(exercise.id);
      return { status: "found", exercise: exercise.name, substitutions: substitutions.map((item) => ({ name: item.substituteExercise.name, reason: item.reason })) };
    },
  },
  {
    name: "start_workout",
    description: "Start one day in the authenticated user's active program. Omit dayNumber only when there is exactly one possible day.",
    category: ToolCategory.ACTION,
    schema: startWorkoutInputSchema,
    handler: async (input, { actor }) => {
      const { dayNumber } = startWorkoutInputSchema.parse(input);
      const current = await getCurrentWorkoutSession(actor.userId, actor.gymId);
      if (current) return { status: "already_in_progress", dayName: current.workoutDay?.name ?? null };
      const program = await getActiveWorkoutProgram(actor.userId, actor.gymId);
      if (!program) return { status: "no_active_program" };
      if (dayNumber === null && program.days.length !== 1) {
        return { status: "clarification_required", options: program.days.map((day) => ({ dayNumber: day.dayNumber, name: day.name })) };
      }
      const day = dayNumber === null ? program.days[0] : program.days.find((item) => item.dayNumber === dayNumber);
      if (!day) return { status: "invalid_day", options: program.days.map((item) => ({ dayNumber: item.dayNumber, name: item.name })) };
      const session = await startWorkoutSession(actor.userId, day.id);
      return {
        status: "started",
        dayName: session.workoutDay?.name ?? day.name,
        exercises: session.exerciseLogs.map((log) => ({ order: log.order, name: log.exercise.name })),
      };
    },
  },
  {
    name: "log_workout_set",
    description: "Log or safely correct one working set in the authenticated user's current workout. Resolve exercise only by its current-session name or displayed order.",
    category: ToolCategory.ACTION,
    schema: logWorkoutSetInputSchema,
    handler: async (input, { actor }) => {
      const parsed = logWorkoutSetInputSchema.parse(input);
      const session = await getCurrentWorkoutSession(actor.userId, actor.gymId);
      if (!session) return { status: "no_active_session" };
      const resolved = resolveSessionExercise(session, parsed.exerciseReference);
      if (!resolved.found) {
        return {
          status: "clarification_required",
          question: "أي تمرين تقصد؟",
          options: (resolved.options.length ? resolved.options : session.exerciseLogs).map((log) => ({ order: log.order, name: log.exercise.name })),
        };
      }
      const result = await logExerciseSet({
        userId: actor.userId,
        gymId: actor.gymId,
        exerciseNumber: resolved.found.order,
        setNumber: parsed.setNumber,
        weightKg: parsed.weightKg,
        reps: parsed.reps,
        rir: parsed.rir ?? null,
      });
      return { status: "logged", exercise: result.exercise.name, setNumber: parsed.setNumber, weightKg: parsed.weightKg, reps: parsed.reps, rir: parsed.rir ?? null };
    },
  },
  {
    name: "finish_workout",
    description: "Finish only the authenticated user's current workout and return its deterministic summary and progression recommendations.",
    category: ToolCategory.ACTION,
    schema: finishWorkoutInputSchema,
    handler: async (input, { actor }) => {
      const { notes } = finishWorkoutInputSchema.parse(input);
      const result = await completeWorkoutSession(actor.userId, notes ?? undefined, actor.gymId);
      return { status: "completed", durationMinutes: result.durationMinutes, exercises: result.exercises };
    },
  },
];
