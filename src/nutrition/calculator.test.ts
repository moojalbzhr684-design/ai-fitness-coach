import { describe, expect, it } from "vitest";
import { ActivityLevel, Goal, Sex } from "../generated/prisma/client.js";
import {
  ACTIVITY_MULTIPLIERS,
  calculateBmr,
  calculateNutritionTargets,
  calculateNutritionTargetsForCalories,
  GOAL_CALORIE_FACTORS,
  PROTEIN_GRAMS_PER_KG,
} from "./calculator.js";

const base = {
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: ActivityLevel.MODERATE,
  goal: Goal.GENERAL_FITNESS,
};

describe("Mifflin-St Jeor calorie calculator", () => {
  it("calculates male BMR", () => {
    expect(calculateBmr({ ...base, sex: Sex.MALE })).toBe(1_780);
  });

  it("calculates female BMR", () => {
    expect(calculateBmr({ ...base, sex: Sex.FEMALE })).toBe(1_614);
  });

  it("uses the male/female midpoint when sex is not specified", () => {
    expect(calculateBmr({ ...base, sex: Sex.PREFER_NOT_TO_SAY })).toBe(1_697);
  });

  it("uses the configured activity multiplier", () => {
    const result = calculateNutritionTargets({ ...base, sex: Sex.MALE });
    expect(result.maintenanceCalories).toBe(Math.round(1_780 * ACTIVITY_MULTIPLIERS.MODERATE));
  });

  it.each([
    [Goal.FAT_LOSS, GOAL_CALORIE_FACTORS.FAT_LOSS],
    [Goal.MUSCLE_GAIN, GOAL_CALORIE_FACTORS.MUSCLE_GAIN],
    [Goal.RECOMPOSITION, GOAL_CALORIE_FACTORS.RECOMPOSITION],
  ])("applies the moderate goal factor for %s", (goal, factor) => {
    const result = calculateNutritionTargets({ ...base, sex: Sex.MALE, goal });
    expect(result.targetCalories).toBe(Math.round(result.maintenanceCalories * factor));
  });

  it("calculates goal-specific bodyweight protein", () => {
    const result = calculateNutritionTargets({ ...base, sex: Sex.MALE, goal: Goal.FAT_LOSS });
    expect(result.proteinGrams).toBe(base.weightKg * PROTEIN_GRAMS_PER_KG.FAT_LOSS);
  });

  it("calculates a positive reasonable fat target", () => {
    const result = calculateNutritionTargets({ ...base, sex: Sex.MALE });
    expect(result.fatGrams).toBeGreaterThan(0);
    expect(result.fatGrams * 9).toBeLessThanOrEqual(result.targetCalories * 0.35 + 1);
  });

  it("allocates remaining calories to carbohydrates", () => {
    const result = calculateNutritionTargets({ ...base, sex: Sex.MALE });
    const macroCalories = result.proteinGrams * 4 + result.fatGrams * 9 + result.carbsGrams * 4;
    expect(macroCalories).toBeCloseTo(result.targetCalories, 0);
  });

  it("never returns negative carbohydrates for an extreme valid profile", () => {
    const result = calculateNutritionTargets({
      age: 80,
      sex: Sex.FEMALE,
      heightCm: 120,
      weightKg: 300,
      activityLevel: ActivityLevel.SEDENTARY,
      goal: Goal.GENERAL_FITNESS,
    });
    expect(result.carbsGrams).toBeGreaterThanOrEqual(0);
  });

  it("recalculates safe macros for an approved calorie target", () => {
    const result = calculateNutritionTargetsForCalories({ ...base, sex: Sex.MALE }, 2_300);
    expect(result.targetCalories).toBe(2_300);
    expect(result.calculationVersion).toContain("approved-adjustment");
    expect(result.proteinGrams * 4 + result.fatGrams * 9 + result.carbsGrams * 4).toBeCloseTo(2_300, 0);
  });

  it("blocks an approved target below the current safety floor", () => {
    expect(() => calculateNutritionTargetsForCalories({ ...base, sex: Sex.MALE }, 1_000)).toThrow("safety floor");
  });

  it("blocks an extreme calorie increase", () => {
    expect(() => calculateNutritionTargetsForCalories({ ...base, sex: Sex.MALE }, 5_000)).toThrow("safety range");
  });
});
