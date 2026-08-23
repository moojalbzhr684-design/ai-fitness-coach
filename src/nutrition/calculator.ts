import { ActivityLevel, Goal, Sex } from "../generated/prisma/client.js";
import type { NutritionCalculation, NutritionCalculationInput } from "./types.js";
import { validateNutritionTarget } from "./validation.js";

export const CALCULATION_VERSION = "mifflin-st-jeor-v1";

export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  [ActivityLevel.SEDENTARY]: 1.2,
  [ActivityLevel.LIGHT]: 1.375,
  [ActivityLevel.MODERATE]: 1.55,
  [ActivityLevel.HIGH]: 1.725,
  [ActivityLevel.VERY_HIGH]: 1.9,
};

export const GOAL_CALORIE_FACTORS: Readonly<Record<Goal, number>> = {
  [Goal.FAT_LOSS]: 0.85,
  [Goal.MUSCLE_GAIN]: 1.08,
  [Goal.RECOMPOSITION]: 0.97,
  [Goal.STRENGTH]: 1.03,
  [Goal.GENERAL_FITNESS]: 1,
};

export const PROTEIN_GRAMS_PER_KG: Readonly<Record<Goal, number>> = {
  [Goal.FAT_LOSS]: 2,
  [Goal.MUSCLE_GAIN]: 1.8,
  [Goal.RECOMPOSITION]: 2,
  [Goal.STRENGTH]: 1.8,
  [Goal.GENERAL_FITNESS]: 1.6,
};

export const MIN_TARGET_TO_BMR_RATIO = 1.05;
const FAT_GRAMS_PER_KG = 0.8;
const MIN_FAT_CALORIE_RATIO = 0.2;
const MAX_FAT_CALORIE_RATIO = 0.35;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
export function calculateBmr(input: Pick<
  NutritionCalculationInput,
  "age" | "sex" | "heightCm" | "weightKg"
>): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  if (input.sex === Sex.MALE) return base + 5;
  if (input.sex === Sex.FEMALE) return base - 161;
  // Neutral strategy: midpoint of the male and female Mifflin-St Jeor estimates.
  return ((base + 5) + (base - 161)) / 2;
}

export function minimumSafeCalorieTarget(bmr: number): number {
  if (!Number.isFinite(bmr) || bmr <= 0) throw new RangeError("BMR must be positive and finite");
  return Math.round(bmr * MIN_TARGET_TO_BMR_RATIO);
}

export function calculateNutritionTargets(
  input: NutritionCalculationInput,
): NutritionCalculation {
  if (!Number.isInteger(input.age) || input.age < 16 || input.age > 80) {
    throw new RangeError("Age must be an integer from 16 to 80");
  }
  if (!Number.isFinite(input.heightCm) || input.heightCm < 120 || input.heightCm > 230) {
    throw new RangeError("Height must be from 120 to 230 cm");
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg < 35 || input.weightKg > 300) {
    throw new RangeError("Weight must be from 35 to 300 kg");
  }

  const bmr = calculateBmr(input);
  const maintenanceCalories = Math.round(bmr * ACTIVITY_MULTIPLIERS[input.activityLevel]);
  const rawTarget = maintenanceCalories * GOAL_CALORIE_FACTORS[input.goal];
  // Product guardrail, not a medical threshold: never generate drastically below estimated BMR.
  const targetCalories = Math.round(Math.max(rawTarget, minimumSafeCalorieTarget(bmr)));
  let proteinGrams = input.weightKg * PROTEIN_GRAMS_PER_KG[input.goal];
  let fatGrams = Math.max(
    input.weightKg * FAT_GRAMS_PER_KG,
    (targetCalories * MIN_FAT_CALORIE_RATIO) / 9,
  );
  fatGrams = Math.min(fatGrams, (targetCalories * MAX_FAT_CALORIE_RATIO) / 9);

  let remainingCalories = targetCalories - proteinGrams * 4 - fatGrams * 9;
  if (remainingCalories < 0) {
    fatGrams = (targetCalories * MIN_FAT_CALORIE_RATIO) / 9;
    proteinGrams = Math.min(proteinGrams, (targetCalories - fatGrams * 9) / 4);
    remainingCalories = targetCalories - proteinGrams * 4 - fatGrams * 9;
  }
  const result: NutritionCalculation = {
    bmr: Math.round(bmr),
    maintenanceCalories,
    targetCalories,
    proteinGrams: round1(proteinGrams),
    fatGrams: round1(fatGrams),
    carbsGrams: round1(Math.max(0, remainingCalories / 4)),
    calculationVersion: CALCULATION_VERSION,
  };
  validateNutritionTarget(result);
  return result;
}

export function calculateNutritionTargetsForCalories(
  input: NutritionCalculationInput,
  targetCalories: number,
): NutritionCalculation {
  const baseline = calculateNutritionTargets(input);
  if (!Number.isInteger(targetCalories) || targetCalories < minimumSafeCalorieTarget(baseline.bmr)) {
    throw new RangeError("Requested calories are below the current safety floor");
  }
  if (targetCalories > baseline.maintenanceCalories * 1.5) {
    throw new RangeError("Requested calories exceed the supported safety range");
  }
  let proteinGrams = input.weightKg * PROTEIN_GRAMS_PER_KG[input.goal];
  let fatGrams = Math.max(
    input.weightKg * FAT_GRAMS_PER_KG,
    (targetCalories * MIN_FAT_CALORIE_RATIO) / 9,
  );
  fatGrams = Math.min(fatGrams, (targetCalories * MAX_FAT_CALORIE_RATIO) / 9);
  let remainingCalories = targetCalories - proteinGrams * 4 - fatGrams * 9;
  if (remainingCalories < 0) {
    fatGrams = (targetCalories * MIN_FAT_CALORIE_RATIO) / 9;
    proteinGrams = Math.min(proteinGrams, (targetCalories - fatGrams * 9) / 4);
    remainingCalories = targetCalories - proteinGrams * 4 - fatGrams * 9;
  }
  const result: NutritionCalculation = {
    bmr: baseline.bmr,
    maintenanceCalories: baseline.maintenanceCalories,
    targetCalories,
    proteinGrams: round1(proteinGrams),
    fatGrams: round1(fatGrams),
    carbsGrams: round1(Math.max(0, remainingCalories / 4)),
    calculationVersion: `${CALCULATION_VERSION}-approved-adjustment`,
  };
  validateNutritionTarget(result);
  return result;
}
