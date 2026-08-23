import {
  ExerciseType,
  ExperienceLevel,
  Goal,
  MovementPattern,
  TrainingPlace,
  WorkoutSplit,
} from "../generated/prisma/client.js";
import { getDayTemplates } from "./templates.js";
import type {
  ExercisePrescription,
  GeneratedWorkoutProgram,
  PrescriptionExerciseMetadata,
  ProgramGenerationInput,
  WorkoutGenerationPreferences,
} from "./types.js";

function isAllowedExercise(
  slug: string,
  metadata: PrescriptionExerciseMetadata,
  preferences: WorkoutGenerationPreferences,
): boolean {
  if (preferences.unavailableSlugs?.has(slug)) return false;
  if (preferences.allowedEquipment && !preferences.allowedEquipment.has(metadata.equipment)) return false;
  return true;
}

function selectExercise(
  candidates: readonly string[],
  exerciseMetadata: ReadonlyMap<string, PrescriptionExerciseMetadata>,
  preferences: WorkoutGenerationPreferences,
): string | null {
  const valid = candidates.filter((slug) => {
    const metadata = exerciseMetadata.get(slug);
    return metadata ? isAllowedExercise(slug, metadata, preferences) : false;
  });
  return valid.find((slug) => preferences.preferredSlugs?.has(slug))
    ?? valid.find((slug) => preferences.explicitlyAvailableSlugs?.has(slug))
    ?? valid[0]
    ?? null;
}

function findCompatibleExercise(
  originalSlug: string,
  exerciseMetadata: ReadonlyMap<string, PrescriptionExerciseMetadata>,
  preferences: WorkoutGenerationPreferences,
): string | null {
  const original = exerciseMetadata.get(originalSlug);
  if (!original) return null;
  const compatible = [...exerciseMetadata.entries()]
    .filter(([, metadata]) => metadata.movementPattern === original.movementPattern
      && metadata.primaryMuscle === original.primaryMuscle)
    .map(([slug]) => slug);
  return selectExercise(compatible, exerciseMetadata, preferences);
}

export function selectWorkoutSplit(
  experienceLevel: ExperienceLevel,
  trainingDaysPerWeek: number,
): WorkoutSplit {
  if (!Number.isInteger(trainingDaysPerWeek) || trainingDaysPerWeek < 2 || trainingDaysPerWeek > 6) {
    throw new RangeError("Training days per week must be an integer from 2 to 6");
  }
  if (trainingDaysPerWeek <= 3) return WorkoutSplit.FULL_BODY;
  if (trainingDaysPerWeek === 6 && experienceLevel === ExperienceLevel.INTERMEDIATE) {
    return WorkoutSplit.PUSH_PULL_LEGS;
  }
  return WorkoutSplit.UPPER_LOWER;
}

export function exerciseCountForSession(
  sessionMinutes: number,
  experienceLevel: ExperienceLevel,
): number {
  if (!Number.isInteger(sessionMinutes) || sessionMinutes < 20 || sessionMinutes > 180) {
    throw new RangeError("Session minutes must be an integer from 20 to 180");
  }
  if (sessionMinutes <= 40) return experienceLevel === ExperienceLevel.BEGINNER ? 4 : 5;
  if (sessionMinutes <= 70) return experienceLevel === ExperienceLevel.BEGINNER ? 5 : 6;
  return experienceLevel === ExperienceLevel.BEGINNER ? 6 : 7;
}

function prescriptionFor(
  input: ProgramGenerationInput,
  metadata: PrescriptionExerciseMetadata,
): Omit<ExercisePrescription, "slug" | "alternatives" | "notes"> {
  const compound = metadata.exerciseType === ExerciseType.COMPOUND;
  const majorCompoundPatterns = new Set<MovementPattern>([
    MovementPattern.HORIZONTAL_PUSH,
    MovementPattern.VERTICAL_PULL,
    MovementPattern.SQUAT,
    MovementPattern.HINGE,
  ]);
  const majorCompound = compound && majorCompoundPatterns.has(metadata.movementPattern);
  const intermediate = input.experienceLevel === ExperienceLevel.INTERMEDIATE;

  let sets = compound ? (intermediate ? 3 : 2) : 2;
  let repMin = compound ? 6 : 10;
  let repMax = compound ? 12 : 15;
  let restSeconds = majorCompound ? 150 : compound ? 120 : 75;
  let rirTarget = input.experienceLevel === ExperienceLevel.BEGINNER ? 3 : 2;

  switch (input.goal) {
    case Goal.STRENGTH:
      if (compound) {
        sets = intermediate ? 4 : 3;
        repMin = 4;
        repMax = 8;
        restSeconds = majorCompound ? 180 : 150;
      } else {
        repMin = 8;
        repMax = 12;
        restSeconds = 90;
      }
      break;
    case Goal.MUSCLE_GAIN:
      sets = compound ? (intermediate ? 4 : 3) : intermediate ? 3 : 2;
      break;
    case Goal.RECOMPOSITION:
      sets = compound ? 3 : 2;
      break;
    case Goal.FAT_LOSS:
      repMin = compound ? 8 : 12;
      repMax = compound ? 12 : 20;
      restSeconds = majorCompound ? 120 : compound ? 90 : 60;
      break;
    case Goal.GENERAL_FITNESS:
      repMin = compound ? 8 : 10;
      repMax = compound ? 12 : 15;
      break;
  }

  return { sets, repMin, repMax, restSeconds, rirTarget, startingWeightKg: null };
}

export function validatePrescription(prescription: ExercisePrescription): void {
  if (!Number.isInteger(prescription.sets) || prescription.sets < 1 || prescription.sets > 5) {
    throw new RangeError("Sets must be an integer from 1 to 5");
  }
  if (!Number.isInteger(prescription.repMin) || prescription.repMin < 1 || prescription.repMin > 30) {
    throw new RangeError("Minimum reps must be an integer from 1 to 30");
  }
  if (!Number.isInteger(prescription.repMax) || prescription.repMax < prescription.repMin || prescription.repMax > 30) {
    throw new RangeError("Maximum reps must be between minimum reps and 30");
  }
  if (!Number.isInteger(prescription.restSeconds) || prescription.restSeconds < 30 || prescription.restSeconds > 300) {
    throw new RangeError("Rest seconds must be an integer from 30 to 300");
  }
  if (prescription.rirTarget !== null && (!Number.isInteger(prescription.rirTarget) || prescription.rirTarget < 0 || prescription.rirTarget > 5)) {
    throw new RangeError("RIR target must be an integer from 0 to 5");
  }
}

export function generateWorkoutProgram(
  input: ProgramGenerationInput,
  exerciseMetadata: ReadonlyMap<string, PrescriptionExerciseMetadata>,
  preferences: WorkoutGenerationPreferences = {},
): GeneratedWorkoutProgram {
  const split = selectWorkoutSplit(input.experienceLevel, input.trainingDaysPerWeek);
  const count = exerciseCountForSession(input.sessionMinutes, input.experienceLevel);
  const templates = getDayTemplates(split, input.trainingPlace, input.trainingDaysPerWeek);
  const beginnerSwaps: Readonly<Record<string, string>> = {
    "barbell-bench-press": "machine-chest-press",
    "back-squat": "leg-press",
    "barbell-row": "chest-supported-row",
    "bulgarian-split-squat": "leg-press",
    "pull-up": "lat-pulldown",
    "romanian-deadlift": "dumbbell-romanian-deadlift",
    "skull-crusher": "cable-pushdown",
  };
  const beginnerHomeSwaps: Readonly<Record<string, string>> = {
    "bulgarian-split-squat": "bodyweight-squat",
  };
  const days = templates.map((day, dayIndex) => ({
    dayNumber: dayIndex + 1,
    name: day.name,
    notes: preferences.preferredWorkoutStyle
      ? `Trainer preference: ${preferences.preferredWorkoutStyle}`
      : null,
    exercises: day.exercises.slice(0, count).map((template) => {
      const beginnerOptions = input.trainingPlace === TrainingPlace.HOME
        ? beginnerHomeSwaps
        : beginnerSwaps;
      const defaultSlug = input.experienceLevel === ExperienceLevel.BEGINNER
        ? (beginnerOptions[template.slug] ?? template.slug)
        : template.slug;
      const candidates = [
        defaultSlug,
        ...(template.alternatives ?? []),
        ...(preferences.substitutions?.get(defaultSlug) ?? []),
      ];
      const slug = selectExercise(candidates, exerciseMetadata, preferences)
        ?? findCompatibleExercise(defaultSlug, exerciseMetadata, preferences)
        // A restrictive tenant configuration must not leave a workout day empty.
        ?? defaultSlug;
      const metadata = exerciseMetadata.get(slug);
      if (!metadata) throw new Error(`Required exercise is unavailable: ${slug}`);
      const basePrescription = prescriptionFor(input, metadata);
      const preferredRange = preferences.preferredRepRange;
      const exercise = {
        ...template,
        slug,
        ...basePrescription,
        ...(preferredRange ? { repMin: preferredRange.min, repMax: preferredRange.max } : {}),
      };
      validatePrescription(exercise);
      return exercise;
    }),
  }));

  const label = split === WorkoutSplit.FULL_BODY
    ? "Full Body"
    : split === WorkoutSplit.UPPER_LOWER
      ? "Upper / Lower"
      : "Push / Pull / Legs";
  return { name: `${label} — ${input.trainingDaysPerWeek} Days`, split, trainingDaysPerWeek: input.trainingDaysPerWeek, days };
}
