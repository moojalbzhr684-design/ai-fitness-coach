import { FoodCategory, MealType } from "../generated/prisma/client.js";
import { estimatePlanCostIqd } from "./budget.js";
import { isFoodAllowed } from "./substitutions.js";
import type {
  FoodConstraints,
  FoodData,
  GeneratedMeal,
  GeneratedMealItem,
  GeneratedNutritionPlan,
  NutritionCalculation,
  NutritionSnapshot,
} from "./types.js";
import {
  snapshotForFood,
  validateFoodQuantity,
  validateMealsPerDay,
  validateNutritionTarget,
} from "./validation.js";

export const PLAN_CALORIE_TOLERANCE = 0.05;
export const PLAN_PROTEIN_TOLERANCE = 0.1;

export class NutritionGenerationError extends Error {
  constructor(
    public readonly code: "CONSTRAINTS_UNSATISFIABLE" | "TARGET_TOLERANCE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "NutritionGenerationError";
  }
}

const defaultProteinOrder = [
  "chicken-breast",
  "tuna-canned-water",
  "turkey-breast",
  "lean-beef",
  "whole-eggs",
  "greek-yogurt-low-fat",
  "tofu-firm",
  "textured-vegetable-protein-dry",
  "lentils-cooked",
  "chickpeas-cooked",
];
const budgetProteinOrder = [
  "whole-eggs",
  "chicken-breast",
  "lentils-cooked",
  "fava-beans-cooked",
  "tuna-canned-water",
  "textured-vegetable-protein-dry",
];
const carbOrder = [
  "cooked-white-rice",
  "potatoes-boiled",
  "bulgur-cooked",
  "basmati-rice-cooked",
  "oats-dry",
  "iraqi-khubz",
  "pasta-cooked",
];
const fatOrder = ["olive-oil", "tahini", "peanut-butter", "almonds", "walnuts"];
const vegetableOrder = ["cucumber", "tomato", "lettuce", "carrots", "zucchini"];
const fruitOrder = ["banana", "apple", "orange", "dates"];

function tokenMatches(food: FoodData, entries: string[]): boolean {
  const values = [food.slug, food.name, food.nameAr ?? ""].map((value) => value.toLowerCase());
  return entries.some((entry) => values.some(
    (value) => value === entry || value.includes(entry) || entry.includes(value),
  ));
}

function rankFoods(
  foods: FoodData[],
  preferredOrder: string[],
  constraints: FoodConstraints,
): FoodData[] {
  return foods.slice().sort((left, right) => {
    const leftPreference = Number(tokenMatches(left, constraints.preferences));
    const rightPreference = Number(tokenMatches(right, constraints.preferences));
    if (leftPreference !== rightPreference) return rightPreference - leftPreference;
    const leftIndex = preferredOrder.indexOf(left.slug);
    const rightIndex = preferredOrder.indexOf(right.slug);
    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
    if (constraints.weeklyBudgetIqd && left.estimatedPriceIqdPerKg !== right.estimatedPriceIqdPerKg) {
      return (left.estimatedPriceIqdPerKg ?? Number.MAX_SAFE_INTEGER)
        - (right.estimatedPriceIqdPerKg ?? Number.MAX_SAFE_INTEGER);
    }
    return Number(right.isIraqiCommon) - Number(left.isIraqiCommon)
      || left.slug.localeCompare(right.slug);
  });
}

function selectFoods(
  foods: FoodData[],
  constraints: FoodConstraints,
  categories: FoodCategory[],
  minimumMacro: (food: FoodData) => boolean,
  preferredOrder: string[],
  count: number,
): FoodData[] {
  const allowed = foods.filter(
    (food) => categories.includes(food.category)
      && minimumMacro(food)
      && isFoodAllowed(food, constraints),
  );
  return rankFoods(allowed, preferredOrder, constraints).slice(0, count);
}

function mealLayout(mealsPerDay: number): Array<{ mealType: MealType; name: string }> {
  const layouts: Record<number, Array<{ mealType: MealType; name: string }>> = {
    2: [
      { mealType: MealType.LUNCH, name: "الغداء" },
      { mealType: MealType.DINNER, name: "العشاء" },
    ],
    3: [
      { mealType: MealType.BREAKFAST, name: "الفطور" },
      { mealType: MealType.LUNCH, name: "الغداء" },
      { mealType: MealType.DINNER, name: "العشاء" },
    ],
    4: [
      { mealType: MealType.BREAKFAST, name: "الفطور" },
      { mealType: MealType.LUNCH, name: "الغداء" },
      { mealType: MealType.SNACK, name: "السناك" },
      { mealType: MealType.DINNER, name: "العشاء" },
    ],
    5: [
      { mealType: MealType.BREAKFAST, name: "الفطور" },
      { mealType: MealType.SNACK, name: "سناك 1" },
      { mealType: MealType.LUNCH, name: "الغداء" },
      { mealType: MealType.SNACK, name: "سناك 2" },
      { mealType: MealType.DINNER, name: "العشاء" },
    ],
    6: [
      { mealType: MealType.BREAKFAST, name: "الفطور" },
      { mealType: MealType.SNACK, name: "سناك 1" },
      { mealType: MealType.LUNCH, name: "الغداء" },
      { mealType: MealType.PRE_WORKOUT, name: "قبل التمرين" },
      { mealType: MealType.DINNER, name: "العشاء" },
      { mealType: MealType.SNACK, name: "سناك 2" },
    ],
  };
  const layout = layouts[mealsPerDay];
  if (!layout) throw new RangeError("Meal layout is unavailable");
  return layout;
}

function sumSnapshots(items: Array<NutritionSnapshot>): NutritionSnapshot {
  return items.reduce<NutritionSnapshot>(
    (total, item) => ({
      calories: total.calories + item.calories,
      proteinGrams: total.proteinGrams + item.proteinGrams,
      carbsGrams: total.carbsGrams + item.carbsGrams,
      fatGrams: total.fatGrams + item.fatGrams,
    }),
    { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 },
  );
}

function averageMacros(foods: FoodData[], assignments: number): [number, number, number] {
  const selected = Array.from({ length: assignments }, (_, index) => foods[index % foods.length]!);
  const total = selected.reduce(
    (sum, food) => [
      sum[0] + food.proteinPer100g / 100,
      sum[1] + food.carbsPer100g / 100,
      sum[2] + food.fatPer100g / 100,
    ] as [number, number, number],
    [0, 0, 0] as [number, number, number],
  );
  return total.map((value) => value / assignments) as [number, number, number];
}

function solveThreeByThree(
  matrix: [number[], number[], number[]],
  values: [number, number, number],
): [number, number, number] | null {
  const rows = matrix.map((row, index) => [...row, values[index]!]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(rows[pivot]![column]!) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const divisor = rows[column]![column]!;
    for (let index = column; index < 4; index += 1) rows[column]![index]! /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row]![column]!;
      for (let index = column; index < 4; index += 1) {
        rows[row]![index]! -= factor * rows[column]![index]!;
      }
    }
  }
  return [rows[0]![3]!, rows[1]![3]!, rows[2]![3]!];
}

function itemFor(food: FoodData, quantityGrams: number): GeneratedMealItem {
  const roundedQuantity = Math.round(quantityGrams * 10) / 10;
  validateFoodQuantity(roundedQuantity);
  const snapshot = snapshotForFood(food, roundedQuantity);
  return {
    foodId: food.id,
    food,
    quantityGrams: roundedQuantity,
    calories: Math.round(snapshot.calories * 10) / 10,
    proteinGrams: Math.round(snapshot.proteinGrams * 10) / 10,
    carbsGrams: Math.round(snapshot.carbsGrams * 10) / 10,
    fatGrams: Math.round(snapshot.fatGrams * 10) / 10,
    notes: null,
  };
}

function relativeDifference(actual: number, target: number): number {
  return Math.abs(actual - target) / target;
}

export function generateNutritionPlan(
  target: NutritionCalculation,
  mealsPerDay: number,
  foods: FoodData[],
  constraints: FoodConstraints,
): GeneratedNutritionPlan {
  validateNutritionTarget(target);
  validateMealsPerDay(mealsPerDay);
  const activeFoods = foods.filter((food) => food.isActive);
  const proteinOrder = constraints.weeklyBudgetIqd ? budgetProteinOrder : defaultProteinOrder;
  const proteins = selectFoods(
    activeFoods,
    constraints,
    [FoodCategory.PROTEIN, FoodCategory.DAIRY, FoodCategory.LEGUME],
    (food) => food.proteinPer100g >= 8,
    proteinOrder,
    Math.min(3, mealsPerDay),
  );
  const carbs = selectFoods(
    activeFoods,
    constraints,
    [FoodCategory.CARBOHYDRATE, FoodCategory.LEGUME],
    (food) => food.carbsPer100g >= 12,
    carbOrder,
    Math.min(3, mealsPerDay),
  );
  const fats = selectFoods(
    activeFoods,
    constraints,
    [FoodCategory.FAT],
    (food) => food.fatPer100g >= 20,
    fatOrder,
    1,
  );
  const vegetables = selectFoods(
    activeFoods,
    constraints,
    [FoodCategory.VEGETABLE],
    () => true,
    vegetableOrder,
    1,
  );
  const fruits = selectFoods(
    activeFoods,
    constraints,
    [FoodCategory.FRUIT],
    () => true,
    fruitOrder,
    1,
  );
  if (!proteins.length || !carbs.length || !fats.length || !vegetables.length) {
    throw new NutritionGenerationError(
      "CONSTRAINTS_UNSATISFIABLE",
      "Dietary constraints leave no safe protein, carbohydrate, fat, or vegetable combination",
    );
  }

  const layout = mealLayout(mealsPerDay);
  const baseItems = layout.map(() => [itemFor(vegetables[0]!, 100)]);
  if (fruits[0]) {
    const snackIndex = layout.findIndex((meal) => meal.mealType === MealType.SNACK);
    baseItems[snackIndex >= 0 ? snackIndex : 0]!.push(itemFor(fruits[0], 100));
  }
  const baseTotals = sumSnapshots(baseItems.flat().map((item) => item));
  const residual: [number, number, number] = [
    target.proteinGrams - baseTotals.proteinGrams,
    target.carbsGrams - baseTotals.carbsGrams,
    target.fatGrams - baseTotals.fatGrams,
  ];
  if (residual.some((value) => value <= 0)) {
    throw new NutritionGenerationError("TARGET_TOLERANCE_FAILED", "Target macros are too low for a safe plan");
  }
  const proteinAverage = averageMacros(proteins, mealsPerDay);
  const carbAverage = averageMacros(carbs, mealsPerDay);
  const fatAverage = averageMacros(fats, mealsPerDay);
  const quantities = solveThreeByThree(
    [
      [proteinAverage[0], carbAverage[0], fatAverage[0]],
      [proteinAverage[1], carbAverage[1], fatAverage[1]],
      [proteinAverage[2], carbAverage[2], fatAverage[2]],
    ],
    residual,
  );
  if (!quantities || quantities.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new NutritionGenerationError(
      "CONSTRAINTS_UNSATISFIABLE",
      "Available foods cannot meet the macro target without an invalid quantity",
    );
  }

  const perMealQuantities = quantities.map((quantity) => quantity / mealsPerDay);
  if (perMealQuantities.some((quantity) => quantity <= 0 || quantity > 2_000)) {
    throw new NutritionGenerationError(
      "CONSTRAINTS_UNSATISFIABLE",
      "Required food quantities are outside product safety limits",
    );
  }
  const meals: GeneratedMeal[] = layout.map((meal, index) => {
    const items = [
      ...baseItems[index]!,
      itemFor(proteins[index % proteins.length]!, perMealQuantities[0]!),
      itemFor(carbs[index % carbs.length]!, perMealQuantities[1]!),
      itemFor(fats[index % fats.length]!, perMealQuantities[2]!),
    ];
    const totals = sumSnapshots(items);
    return {
      order: index + 1,
      mealType: meal.mealType,
      name: meal.name,
      targetCalories: Math.round(target.targetCalories / mealsPerDay),
      items,
      totals,
    };
  });
  const rawTotals = sumSnapshots(meals.map((meal) => meal.totals));
  const totals: NutritionSnapshot = {
    calories: Math.round(rawTotals.calories),
    proteinGrams: Math.round(rawTotals.proteinGrams * 10) / 10,
    carbsGrams: Math.round(rawTotals.carbsGrams * 10) / 10,
    fatGrams: Math.round(rawTotals.fatGrams * 10) / 10,
  };
  if (relativeDifference(totals.calories, target.targetCalories) > PLAN_CALORIE_TOLERANCE
    || relativeDifference(totals.proteinGrams, target.proteinGrams) > PLAN_PROTEIN_TOLERANCE) {
    throw new NutritionGenerationError(
      "TARGET_TOLERANCE_FAILED",
      "Available food data cannot meet the calorie/protein tolerance safely",
    );
  }
  const costs = estimatePlanCostIqd(meals);
  const warnings: string[] = [];
  if (constraints.weeklyBudgetIqd && costs.weeklyCostIqd !== null
    && costs.weeklyCostIqd > constraints.weeklyBudgetIqd) {
    warnings.push("Estimated weekly cost exceeds the entered budget; calorie and protein safety were preserved.");
  }
  if (costs.weeklyCostIqd === null) {
    warnings.push("Some food prices are unavailable, so total cost could not be estimated.");
  }
  return {
    name: "Structured Nutrition Plan",
    mealsPerDay,
    meals,
    totals,
    estimatedDailyCostIqd: costs.dailyCostIqd,
    estimatedWeeklyCostIqd: costs.weeklyCostIqd,
    warnings,
  };
}
