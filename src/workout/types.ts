import type {
  EquipmentType,
  ExerciseType,
  ExperienceLevel,
  Goal,
  MovementPattern,
  MuscleGroup,
  TrainingPlace,
  WorkoutSplit,
} from "../generated/prisma/client.js";

export interface ProgramGenerationInput {
  experienceLevel: ExperienceLevel;
  goal: Goal;
  trainingDaysPerWeek: number;
  trainingPlace: TrainingPlace;
  sessionMinutes: number;
}
export interface ExerciseTemplate {
  slug: string;
  alternatives?: string[];
  notes?: string;
}

export interface DayTemplate {
  name: string;
  exercises: ExerciseTemplate[];
}

export interface ExercisePrescription extends ExerciseTemplate {
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  rirTarget: number | null;
  startingWeightKg: number | null;
}

export interface GeneratedWorkoutDay {
  dayNumber: number;
  name: string;
  notes: string | null;
  exercises: ExercisePrescription[];
}

export interface GeneratedWorkoutProgram {
  name: string;
  split: WorkoutSplit;
  trainingDaysPerWeek: number;
  days: GeneratedWorkoutDay[];
}

export interface PrescriptionExerciseMetadata {
  exerciseType: ExerciseType;
  equipment: EquipmentType;
  movementPattern: MovementPattern;
  primaryMuscle: MuscleGroup;
}

export type ProgressionAction =
  | "KEEP_WEIGHT"
  | "INCREASE_WEIGHT"
  | "DECREASE_WEIGHT"
  | "REPEAT_SESSION";

export interface ProgressionSet {
  reps: number;
  weightKg: number | null;
  rir: number | null;
  isWarmup: boolean;
}

export interface ProgressionPrescription {
  sets: number;
  repMin: number;
  repMax: number;
  rirTarget: number | null;
  primaryMuscle: MuscleGroup;
  equipment: EquipmentType;
}

export interface ProgressionRecommendation {
  action: ProgressionAction;
  currentWeightKg: number | null;
  recommendedWeightKg: number | null;
  reason: string;
}
