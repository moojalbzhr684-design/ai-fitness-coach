import { describe, expect, it, vi } from "vitest";
import { ActivityLevel, DietaryTag, Goal, NutritionPlanStatus, Sex } from "../generated/prisma/client.js";
import { foodSeeds } from "../../prisma/food-seed.js";
import { calculateNutritionTargets } from "./calculator.js";
import { generateNutritionPlan, PLAN_CALORIE_TOLERANCE, PLAN_PROTEIN_TOLERANCE } from "./generator.js";
import { archiveActiveNutritionPlans } from "./history.js";
import type { FoodConstraints, FoodData } from "./types.js";

const foods = foodSeeds.map((item): FoodData => ({
  ...item,
  id: item.slug,
  dietaryTags: item.dietaryTags,
  allergenTags: item.allergenTags,
  isActive: true,
}));
const target = calculateNutritionTargets({
  age: 30,
  sex: Sex.MALE,
  heightCm: 178,
  weightKg: 80,
  activityLevel: ActivityLevel.MODERATE,
  goal: Goal.MUSCLE_GAIN,
});
const constraints: FoodConstraints = {
  preferences: [],
  dislikedFoods: [],
  allergies: [],
  dietaryRestrictions: [],
  weeklyBudgetIqd: null,
};

describe("nutrition plan generation", () => {
  it.each([2, 3, 4, 5, 6])("creates exactly %i meals", (mealsPerDay) => {
    expect(generateNutritionPlan(target, mealsPerDay, foods, constraints).meals)
      .toHaveLength(mealsPerDay);
  });

  it("meets documented calorie and protein tolerances", () => {
    const result = generateNutritionPlan(target, 4, foods, constraints);
    expect(Math.abs(result.totals.calories - target.targetCalories) / target.targetCalories)
      .toBeLessThanOrEqual(PLAN_CALORIE_TOLERANCE);
    expect(Math.abs(result.totals.proteinGrams - target.proteinGrams) / target.proteinGrams)
      .toBeLessThanOrEqual(PLAN_PROTEIN_TOLERANCE);
  });

  it("never selects an allergy-tagged food", () => {
    const result = generateNutritionPlan(
      target,
      4,
      foods,
      { ...constraints, allergies: ["fish"] },
    );
    expect(result.meals.flatMap((meal) => meal.items)
      .some((item) => item.food.allergenTags.includes("fish"))).toBe(false);
  });

  it("respects gluten-free dietary restrictions", () => {
    const result = generateNutritionPlan(
      target,
      4,
      foods,
      { ...constraints, dietaryRestrictions: [DietaryTag.GLUTEN_FREE] },
    );
    expect(result.meals.flatMap((meal) => meal.items)
      .every((item) => item.food.dietaryTags.includes(DietaryTag.GLUTEN_FREE))).toBe(true);
  });

  it("builds a fully vegan plan when requested", () => {
    const result = generateNutritionPlan(
      target,
      4,
      foods,
      { ...constraints, dietaryRestrictions: [DietaryTag.VEGAN] },
    );
    expect(result.meals.flatMap((meal) => meal.items)
      .every((item) => item.food.dietaryTags.includes(DietaryTag.VEGAN))).toBe(true);
  });

  it("refuses an unknown dietary restriction instead of silently violating it", () => {
    expect(() => generateNutritionPlan(
      target,
      4,
      foods,
      { ...constraints, dietaryRestrictions: ["UNMODELED_RESTRICTION"] },
    )).toThrow("Dietary constraints leave no safe");
  });

  it("returns a budget warning without sacrificing target tolerance", () => {
    const result = generateNutritionPlan(
      target,
      4,
      foods,
      { ...constraints, weeklyBudgetIqd: 1_000 },
    );
    expect(result.warnings).toHaveLength(1);
    expect(Math.abs(result.totals.calories - target.targetCalories) / target.targetCalories)
      .toBeLessThanOrEqual(PLAN_CALORIE_TOLERANCE);
  });

  it("regeneration archives active plans instead of deleting history", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const endedAt = new Date("2026-08-23T12:00:00Z");
    await archiveActiveNutritionPlans({ nutritionPlan: { updateMany } }, "user-1", endedAt);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: NutritionPlanStatus.ACTIVE },
      data: { status: NutritionPlanStatus.ARCHIVED, endedAt },
    });
  });
});
