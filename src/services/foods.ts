import { NutritionPlanStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { calculateFoodSubstitutions } from "../nutrition/substitutions.js";
import type { FoodConstraints, FoodData } from "../nutrition/types.js";
import { normalizeUserList } from "../nutrition/validation.js";

export function toFoodData(food: {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  category: FoodData["category"];
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  defaultUnit: FoodData["defaultUnit"];
  defaultServingGrams: number | null;
  estimatedPriceIqdPerKg: number | null;
  dietaryTags: unknown;
  allergenTags: unknown;
  isIraqiCommon: boolean;
  isActive: boolean;
}): FoodData {
  return {
    ...food,
    dietaryTags: normalizeUserList(food.dietaryTags).map((item) => item.toUpperCase()),
    allergenTags: normalizeUserList(food.allergenTags),
  };
}

function constraintsFromProfile(profile: {
  foodPreferences: unknown;
  dislikedFoods: unknown;
  allergies: unknown;
  dietaryRestrictions: unknown;
  weeklyFoodBudgetIqd: number | null;
}): FoodConstraints {
  return {
    preferences: normalizeUserList(profile.foodPreferences),
    dislikedFoods: normalizeUserList(profile.dislikedFoods),
    allergies: normalizeUserList(profile.allergies),
    dietaryRestrictions: normalizeUserList(profile.dietaryRestrictions),
    weeklyBudgetIqd: profile.weeklyFoodBudgetIqd && profile.weeklyFoodBudgetIqd > 0
      ? profile.weeklyFoodBudgetIqd
      : null,
  };
}

export async function listActiveFoods() {
  const foods = await prisma.food.findMany({
    where: { isActive: true },
    orderBy: [{ isIraqiCommon: "desc" }, { category: "asc" }, { name: "asc" }],
  });
  return foods.map(toFoodData);
}

export async function getFoodSubstitutions(
  foodId: string,
  originalQuantityGrams: number,
  userId: string,
) {
  const [original, substitutions, user] = await Promise.all([
    prisma.food.findUnique({ where: { id: foodId } }),
    prisma.foodSubstitution.findMany({
      where: { foodId, substituteFood: { isActive: true } },
      include: { substituteFood: true },
      orderBy: { priority: "asc" },
    }),
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
  ]);
  if (!original || !user?.profile) return [];
  return calculateFoodSubstitutions(
    toFoodData(original),
    originalQuantityGrams,
    substitutions.map((item) => ({ food: toFoodData(item.substituteFood), priority: item.priority })),
    constraintsFromProfile(user.profile),
  );
}

export async function getMealItemAlternatives(
  userId: string,
  mealNumber: number,
  foodNumber: number,
) {
  if (!Number.isInteger(mealNumber) || mealNumber < 1
    || !Number.isInteger(foodNumber) || foodNumber < 1) return null;
  const plan = await prisma.nutritionPlan.findFirst({
    where: { userId, status: NutritionPlanStatus.ACTIVE },
    include: {
      meals: {
        where: { order: mealNumber },
        include: {
          items: { where: { order: foodNumber }, include: { food: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });
  const item = plan?.meals[0]?.items[0];
  if (!item) return null;
  const alternatives = await getFoodSubstitutions(item.foodId, item.quantityGrams, userId);
  return { item, alternatives };
}

export { constraintsFromProfile };
