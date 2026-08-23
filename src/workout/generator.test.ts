import { describe, expect, it } from "vitest";
import {
  EquipmentType,
  ExerciseType,
  ExperienceLevel,
  Goal,
  MovementPattern,
  MuscleGroup,
  TrainingPlace,
  WorkoutSplit,
} from "../generated/prisma/client.js";
import { generateWorkoutProgram, selectWorkoutSplit, validatePrescription } from "./generator.js";
import type { PrescriptionExerciseMetadata } from "./types.js";

describe("workout split selection", () => {
  it.each([
    [ExperienceLevel.BEGINNER, 2, WorkoutSplit.FULL_BODY],
    [ExperienceLevel.BEGINNER, 3, WorkoutSplit.FULL_BODY],
    [ExperienceLevel.BEGINNER, 4, WorkoutSplit.UPPER_LOWER],
    [ExperienceLevel.INTERMEDIATE, 6, WorkoutSplit.PUSH_PULL_LEGS],
  ])("selects %s for %i days as %s", (level, days, expected) => {
    expect(selectWorkoutSplit(level, days)).toBe(expected);
  });

  it("rejects training days outside 2-6", () => {
    expect(() => selectWorkoutSplit(ExperienceLevel.BEGINNER, 1)).toThrow(RangeError);
    expect(() => selectWorkoutSplit(ExperienceLevel.INTERMEDIATE, 7)).toThrow(RangeError);
  });
});

describe("program generation", () => {
  const defaultMetadata: PrescriptionExerciseMetadata = {
    exerciseType: ExerciseType.COMPOUND,
    equipment: EquipmentType.MACHINE,
    movementPattern: MovementPattern.SQUAT,
    primaryMuscle: MuscleGroup.QUADS,
  };
  it("limits a short beginner session to four exercises and valid prescriptions", () => {
    const metadata = new Proxy(new Map<string, PrescriptionExerciseMetadata>(), {
      get(target, property, receiver) {
        if (property === "get") {
          return () => ({
            exerciseType: ExerciseType.COMPOUND,
            equipment: EquipmentType.MACHINE,
            movementPattern: MovementPattern.SQUAT,
            primaryMuscle: MuscleGroup.QUADS,
          });
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const generated = generateWorkoutProgram(
      {
        experienceLevel: ExperienceLevel.BEGINNER,
        goal: Goal.GENERAL_FITNESS,
        trainingDaysPerWeek: 2,
        trainingPlace: TrainingPlace.GYM,
        sessionMinutes: 30,
      },
      metadata,
    );
    expect(generated.days).toHaveLength(2);
    expect(generated.days.every((day) => day.exercises.length === 4)).toBe(true);
    for (const day of generated.days) {
      for (const exercise of day.exercises) expect(() => validatePrescription(exercise)).not.toThrow();
    }
  });

  it("uses home-compatible upper/lower templates for a four-day home program", () => {
    const metadata = new Proxy(new Map<string, PrescriptionExerciseMetadata>(), {
      get(target, property, receiver) {
        if (property === "get") {
          return () => ({
            exerciseType: ExerciseType.COMPOUND,
            equipment: EquipmentType.DUMBBELL,
            movementPattern: MovementPattern.OTHER,
            primaryMuscle: MuscleGroup.FULL_BODY,
          });
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const generated = generateWorkoutProgram(
      {
        experienceLevel: ExperienceLevel.BEGINNER,
        goal: Goal.GENERAL_FITNESS,
        trainingDaysPerWeek: 4,
        trainingPlace: TrainingPlace.HOME,
        sessionMinutes: 60,
      },
      metadata,
    );
    expect(generated.split).toBe(WorkoutSplit.UPPER_LOWER);
    expect(generated.days.map((day) => day.name)).toEqual([
      "Upper A",
      "Lower A",
      "Upper B",
      "Lower B",
    ]);
    expect(generated.days.flatMap((day) => day.exercises).map((item) => item.slug))
      .not.toContain("leg-press");
  });

  it("excludes an unavailable exercise and selects a configured template substitution", () => {
    const slugs = [
      "leg-press", "goblet-squat", "machine-chest-press", "lat-pulldown", "seated-leg-curl",
      "hack-squat", "incline-dumbbell-press", "seated-cable-row", "hip-thrust",
      "dumbbell-lateral-raise", "machine-shoulder-press",
    ];
    const metadata = new Map(slugs.map((slug) => [slug, defaultMetadata]));
    const generated = generateWorkoutProgram({
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      goal: Goal.GENERAL_FITNESS,
      trainingDaysPerWeek: 2,
      trainingPlace: TrainingPlace.GYM,
      sessionMinutes: 30,
    }, metadata, { unavailableSlugs: new Set(["leg-press"]) });
    expect(generated.days[0]?.exercises[0]?.slug).toBe("goblet-squat");
    expect(generated.days.flatMap((day) => day.exercises).map(({ slug }) => slug)).not.toContain("leg-press");
  });

  it("applies a safe trainer rep range and preference note deterministically", () => {
    const metadata = new Proxy(new Map<string, PrescriptionExerciseMetadata>(), {
      get(target, property, receiver) {
        if (property === "get") return () => defaultMetadata;
        return Reflect.get(target, property, receiver);
      },
    });
    const generated = generateWorkoutProgram({
      experienceLevel: ExperienceLevel.INTERMEDIATE,
      goal: Goal.MUSCLE_GAIN,
      trainingDaysPerWeek: 2,
      trainingPlace: TrainingPlace.GYM,
      sessionMinutes: 30,
    }, metadata, { preferredRepRange: { min: 8, max: 10 }, preferredWorkoutStyle: "controlled tempo" });
    expect(generated.days.every((day) => day.notes?.includes("controlled tempo"))).toBe(true);
    expect(generated.days.flatMap((day) => day.exercises).every((exercise) => exercise.repMin === 8 && exercise.repMax === 10)).toBe(true);
  });
});

describe("prescription validation", () => {
  const valid = {
    slug: "test",
    sets: 3,
    repMin: 8,
    repMax: 12,
    restSeconds: 120,
    rirTarget: 2,
    startingWeightKg: null,
  };

  it("accepts a safe prescription", () => {
    expect(() => validatePrescription(valid)).not.toThrow();
  });

  it.each([
    { ...valid, sets: 6 },
    { ...valid, repMin: 0 },
    { ...valid, repMax: 7 },
    { ...valid, restSeconds: 20 },
    { ...valid, rirTarget: 6 },
  ])("rejects an invalid prescription", (prescription) => {
    expect(() => validatePrescription(prescription)).toThrow(RangeError);
  });
});
