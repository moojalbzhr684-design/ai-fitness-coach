import type { FoodData, NutritionCalculation, NutritionSnapshot } from "./types.js";

export const MAX_FOOD_QUANTITY_GRAMS = 2_000;

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
}

export function validateFoodMacros(food: Pick<
  FoodData,
  "caloriesPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g"
>): void {
  const macros = {
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
  };
  for (const [label, value] of Object.entries(macros)) {
    assertFinite(value, label);
    if (value < 0) throw new RangeError(`${label} cannot be negative`);
  }
}

export function validateFoodQuantity(quantityGrams: number): void {
  assertFinite(quantityGrams, "Food quantity");
  if (quantityGrams <= 0 || quantityGrams > MAX_FOOD_QUANTITY_GRAMS) {
    throw new RangeError(`Food quantity must be above 0 and at most ${MAX_FOOD_QUANTITY_GRAMS}g`);
  }
}

export function validateMealsPerDay(mealsPerDay: number): void {
  if (!Number.isInteger(mealsPerDay) || mealsPerDay < 2 || mealsPerDay > 6) {
    throw new RangeError("Meals per day must be an integer from 2 to 6");
  }
}

export function validateNutritionTarget(target: NutritionCalculation): void {
  for (const [label, value] of Object.entries(target)) {
    if (label === "calculationVersion") continue;
    assertFinite(value as number, label);
  }
  if (target.bmr <= 0 || target.maintenanceCalories <= 0 || target.targetCalories <= 0) {
    throw new RangeError("Calorie targets must be positive");
  }
  if (target.proteinGrams <= 0 || target.fatGrams <= 0 || target.carbsGrams < 0) {
    throw new RangeError("Macro targets are invalid");
  }
}

export function snapshotForFood(food: FoodData, quantityGrams: number): NutritionSnapshot {
  validateFoodMacros(food);
  validateFoodQuantity(quantityGrams);
  const factor = quantityGrams / 100;
  return {
    calories: food.caloriesPer100g * factor,
    proteinGrams: food.proteinPer100g * factor,
    carbsGrams: food.carbsPer100g * factor,
    fatGrams: food.fatPer100g * factor,
  };
}

export function normalizeUserList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,،]/)
      : value && typeof value === "object"
        ? Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([key]) => key)
        : [];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
