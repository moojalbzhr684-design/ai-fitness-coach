import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentType } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const tx = {
    gymExerciseAvailability: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    canManageGym: vi.fn(),
    prisma: {
      exercise: { findUnique: vi.fn() },
      gymSettings: { findUnique: vi.fn() },
      gymExerciseAvailability: { findMany: vi.fn() },
      trainerAssignment: { findFirst: vi.fn() },
      exerciseSubstitution: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
    },
    tx,
  };
});
vi.mock("../auth/permissions.js", () => ({ canManageGym: mocks.canManageGym }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { getGymWorkoutPreferences, GymExerciseError, setGymExerciseAvailability } from "./gym-exercises.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.prisma.exerciseSubstitution.findMany.mockResolvedValue([]);
});

describe("gym exercise availability", () => {
  it("lets an owner configure availability and writes an audit record", async () => {
    mocks.canManageGym.mockResolvedValue(true);
    mocks.prisma.exercise.findUnique.mockResolvedValue({ id: "exercise-a" });
    mocks.tx.gymExerciseAvailability.upsert.mockResolvedValue({ id: "availability-a", isAvailable: false });
    await setGymExerciseAvailability("owner-a", "gym-a", "exercise-a", false, "No bench station");
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "GYM_EXERCISE_AVAILABILITY_CHANGED", gymId: "gym-a", targetId: "exercise-a" }),
    });
  });

  it("blocks a trainer from changing tenant equipment", async () => {
    mocks.canManageGym.mockResolvedValue(false);
    await expect(setGymExerciseAvailability("trainer-a", "gym-a", "exercise-a", false)).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<GymExerciseError>);
  });

  it("combines gym and assigned-trainer workout preferences", async () => {
    mocks.prisma.gymSettings.findUnique.mockResolvedValue({ allowedEquipment: ["DUMBBELL", "INVALID"] });
    mocks.prisma.gymExerciseAvailability.findMany.mockResolvedValue([
      { isAvailable: false, exercise: { slug: "barbell-bench-press" } },
      { isAvailable: true, exercise: { slug: "dumbbell-bench-press" } },
    ]);
    mocks.prisma.trainerAssignment.findFirst.mockResolvedValue({
      trainer: { trainerPreferences: [{
        preferredWorkoutStyle: "controlled tempo",
        exercisePreferences: { preferredSlugs: ["dumbbell-bench-press"] },
        preferredRepRanges: { min: 8, max: 12 },
      }] },
    });
    mocks.prisma.exerciseSubstitution.findMany.mockResolvedValue([{
      exercise: { slug: "barbell-bench-press" },
      substituteExercise: { slug: "dumbbell-bench-press" },
    }]);
    const result = await getGymWorkoutPreferences("gym-a", "member-a");
    expect(result.unavailableSlugs).toEqual(new Set(["barbell-bench-press"]));
    expect(result.explicitlyAvailableSlugs).toEqual(new Set(["dumbbell-bench-press"]));
    expect(result.allowedEquipment).toEqual(new Set([EquipmentType.DUMBBELL]));
    expect(result.preferredRepRange).toEqual({ min: 8, max: 12 });
    expect(result.substitutions?.get("barbell-bench-press")).toEqual(["dumbbell-bench-press"]);
  });

  it("falls back safely when no availability rows or preferences exist", async () => {
    mocks.prisma.gymSettings.findUnique.mockResolvedValue(null);
    mocks.prisma.gymExerciseAvailability.findMany.mockResolvedValue([]);
    mocks.prisma.trainerAssignment.findFirst.mockResolvedValue(null);
    const result = await getGymWorkoutPreferences("gym-a", "member-a");
    expect(result.unavailableSlugs?.size).toBe(0);
    expect(result.allowedEquipment).toBeUndefined();
    expect(result.preferredWorkoutStyle).toBeNull();
  });
});
