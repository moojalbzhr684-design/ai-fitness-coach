import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, SystemRole } from "../../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  getActiveProgram: vi.fn(),
  getWorkoutDay: vi.fn(),
  getWorkoutProgress: vi.fn(),
  getCurrent: vi.fn(),
  getRecent: vi.fn(),
  start: vi.fn(),
  log: vi.fn(),
  complete: vi.fn(),
  substitutions: vi.fn(),
}));
vi.mock("../../services/workout-programs.js", () => ({
  getActiveWorkoutProgram: mocks.getActiveProgram,
  getWorkoutDay: mocks.getWorkoutDay,
  getWorkoutProgress: mocks.getWorkoutProgress,
}));
vi.mock("../../services/workout-sessions.js", () => ({
  getCurrentWorkoutSession: mocks.getCurrent,
  getRecentWorkoutHistory: mocks.getRecent,
  startWorkoutSession: mocks.start,
  logExerciseSet: mocks.log,
  completeWorkoutSession: mocks.complete,
}));
vi.mock("../../services/exercises.js", () => ({ getExerciseSubstitutions: mocks.substitutions }));

import { workoutTools } from "./workout.js";

const actor = { userId: "member-a", gymId: "gym-a", systemRole: SystemRole.USER, gymRole: GymRole.MEMBER, allowActions: true, gymSelectionRequired: false };
const execution = { actor, aiEventId: "event-a" };
const bench = { id: "exercise-bench", name: "Bench Press", primaryMuscle: "CHEST", equipment: "BARBELL" };
const shoulder = { id: "exercise-shoulder", name: "Shoulder Press", primaryMuscle: "SHOULDERS", equipment: "DUMBBELL" };
const program = {
  id: "program-a", name: "Upper Lower", split: "UPPER_LOWER", trainingDaysPerWeek: 2,
  days: [
    { id: "day-a", dayNumber: 1, name: "Upper", exercises: [{ exerciseId: bench.id, order: 1, sets: 3, repMin: 8, repMax: 10, rirTarget: 2, restSeconds: 120, exercise: bench }] },
    { id: "day-b", dayNumber: 2, name: "Shoulders", exercises: [{ exerciseId: shoulder.id, order: 1, sets: 3, repMin: 8, repMax: 12, rirTarget: 2, restSeconds: 90, exercise: shoulder }] },
  ],
};
const current = {
  id: "session-a", startedAt: new Date(), workoutDay: { name: "Upper", exercises: program.days[0]!.exercises },
  exerciseLogs: [
    { id: "log-a", order: 1, exerciseId: bench.id, exercise: bench, setLogs: [] },
    { id: "log-b", order: 2, exerciseId: shoulder.id, exercise: shoulder, setLogs: [] },
  ],
};

function tool(name: string) {
  const found = workoutTools.find((item) => item.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveProgram.mockResolvedValue(program);
  mocks.getCurrent.mockResolvedValue(null);
  mocks.start.mockResolvedValue(current);
  mocks.log.mockResolvedValue({ exercise: bench, setLog: {} });
  mocks.complete.mockResolvedValue({ sessionId: "session-a", durationMinutes: 45, exercises: [{ exercise: bench, sets: [], recommendation: { action: "REPEAT" } }] });
  mocks.getWorkoutProgress.mockResolvedValue([]);
});

describe("workout Agent tools", () => {
  it("returns the authenticated user's active program without model-controlled identity", async () => {
    const result = await tool("get_active_workout_program").handler({}, execution);
    expect(mocks.getActiveProgram).toHaveBeenCalledWith("member-a", "gym-a");
    expect(result).toMatchObject({ status: "found", program: { trainingDaysPerWeek: 2 } });
  });

  it("requires clarification before starting when multiple workout days are plausible", async () => {
    const result = await tool("start_workout").handler({}, execution);
    expect(result).toMatchObject({ status: "clarification_required" });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("starts only a selected day from the active program", async () => {
    const result = await tool("start_workout").handler({ dayNumber: 1 }, execution);
    expect(mocks.start).toHaveBeenCalledWith("member-a", "day-a");
    expect(result).toMatchObject({ status: "started", dayName: "Upper" });
  });

  it("handles duplicate start idempotently through current-session state", async () => {
    mocks.getCurrent.mockResolvedValue(current);
    const result = await tool("start_workout").handler({ dayNumber: 1 }, execution);
    expect(result).toEqual({ status: "already_in_progress", dayName: "Upper" });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("does not log an ambiguous exercise reference", async () => {
    mocks.getCurrent.mockResolvedValue(current);
    const result = await tool("log_workout_set").handler({ exerciseReference: "Press", setNumber: 1, weightKg: 20, reps: 10 }, execution);
    expect(result).toMatchObject({ status: "clarification_required", question: "أي تمرين تقصد؟" });
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("logs a valid set only by current-session exercise order", async () => {
    mocks.getCurrent.mockResolvedValue(current);
    const result = await tool("log_workout_set").handler({ exerciseReference: "Bench Press", setNumber: 1, weightKg: 60, reps: 10, rir: 2 }, execution);
    expect(mocks.log).toHaveBeenCalledWith({ userId: "member-a", gymId: "gym-a", exerciseNumber: 1, setNumber: 1, weightKg: 60, reps: 10, rir: 2 });
    expect(result).toMatchObject({ status: "logged", exercise: "Bench Press" });
  });

  it("finishes through the workout service and returns its real progression result", async () => {
    const result = await tool("finish_workout").handler({ notes: "زين" }, execution);
    expect(mocks.complete).toHaveBeenCalledWith("member-a", "زين", "gym-a");
    expect(result).toMatchObject({ status: "completed", durationMinutes: 45, exercises: [{ recommendation: { action: "REPEAT" } }] });
  });
});
