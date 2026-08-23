import { DietaryTag, FoodCategory } from "../generated/prisma/client.js";
import { estimateFoodCostIqd } from "./budget.js";
import type {
  FoodConstraints,
  FoodData,
  FoodSubstitutionCandidate,
} from "./types.js";
import { snapshotForFood, validateFoodQuantity } from "./validation.js";

function normalizedTokens(food: FoodData): string[] {
  return [food.slug, food.name, food.nameAr ?? ""].map((value) => value.trim().toLowerCase());
}

function matchesFoodEntry(food: FoodData, entries: string[]): boolean {
  const tokens = normalizedTokens(food);
  return entries.some((entry) => tokens.some(
    (token) => token === entry || token.includes(entry) || entry.includes(token),
  ));
}

const allergenAliases: Readonly<Record<string, string[]>> = {
  milk: ["milk", "dairy", "حليب", "لبن", "روب"],
  egg: ["egg", "eggs", "بيض"],
  fish: ["fish", "seafood", "سمك", "تونة"],
  peanut: ["peanut", "فول سوداني"],
  tree_nut: ["tree nut", "nuts", "مكسرات", "لوز", "جوز"],
  gluten: ["gluten", "wheat", "قمح"],
  sesame: ["sesame", "طحينية", "سمسم"],
  soy: ["soy", "صويا"],
};

function hasAllergen(food: FoodData, allergies: string[]): boolean {
  const expanded = new Set(allergies);
  for (const allergy of allergies) {
    for (const [tag, aliases] of Object.entries(allergenAliases)) {
      if (aliases.some((alias) => allergy.includes(alias) || alias.includes(allergy))) expanded.add(tag);
    }
  }
  return food.allergenTags.some((tag) => expanded.has(tag.toLowerCase()))
    || matchesFoodEntry(food, allergies);
}

function hasTag(food: FoodData, tag: DietaryTag): boolean {
  return food.dietaryTags.includes(tag);
}

export function isFoodAllowed(food: FoodData, constraints: FoodConstraints): boolean {
  if (!food.isActive || matchesFoodEntry(food, constraints.dislikedFoods)) return false;
  if (hasAllergen(food, constraints.allergies)) return false;
  const restrictionAliases: Readonly<Record<string, DietaryTag>> = {
    "نباتي": DietaryTag.VEGETARIAN,
    "نباتي صرف": DietaryTag.VEGAN,
    "خالي من الغلوتين": DietaryTag.GLUTEN_FREE,
    "خالي من الالبان": DietaryTag.DAIRY_FREE,
    "خالي من الألبان": DietaryTag.DAIRY_FREE,
    "حلال": DietaryTag.HALAL,
  };
  const restrictions = new Set(constraints.dietaryRestrictions.map((item) => {
    const normalized = item.trim().toLowerCase();
    return restrictionAliases[normalized]
      ?? normalized.toUpperCase().replace(/[ -]+/g, "_");
  }));
  const supportedRestrictions = new Set<string>(Object.values(DietaryTag));
  if ([...restrictions].some((restriction) => !supportedRestrictions.has(restriction))) {
    // Unknown restrictions cannot be proven safe from structured food tags.
    return false;
  }
  if (restrictions.has(DietaryTag.VEGAN) && !hasTag(food, DietaryTag.VEGAN)) return false;
  if (restrictions.has(DietaryTag.VEGETARIAN)
    && !hasTag(food, DietaryTag.VEGETARIAN)
    && !hasTag(food, DietaryTag.VEGAN)) return false;
  if (restrictions.has(DietaryTag.GLUTEN_FREE) && !hasTag(food, DietaryTag.GLUTEN_FREE)) return false;
  if (restrictions.has(DietaryTag.DAIRY_FREE) && !hasTag(food, DietaryTag.DAIRY_FREE)) return false;
  if (restrictions.has(DietaryTag.HALAL) && !hasTag(food, DietaryTag.HALAL)) return false;
  if (restrictions.has(DietaryTag.OTHER) && !hasTag(food, DietaryTag.OTHER)) return false;
  return true;
}

function differencePercent(
  original: ReturnType<typeof snapshotForFood>,
  candidate: ReturnType<typeof snapshotForFood>,
  category: FoodCategory,
): number {
  const relative = (left: number, right: number) => left <= 0 ? 0 : Math.abs(right - left) / left;
  const differences = category === FoodCategory.PROTEIN
    ? [relative(original.proteinGrams, candidate.proteinGrams), relative(original.calories, candidate.calories)]
    : category === FoodCategory.CARBOHYDRATE || category === FoodCategory.LEGUME
      ? [relative(original.carbsGrams, candidate.carbsGrams), relative(original.calories, candidate.calories)]
      : category === FoodCategory.FAT
        ? [relative(original.fatGrams, candidate.fatGrams), relative(original.calories, candidate.calories)]
        : [relative(original.calories, candidate.calories)];
  return Math.round((differences.reduce((sum, value) => sum + value, 0) / differences.length) * 1_000) / 10;
}

function replacementQuantity(
  original: FoodData,
  originalQuantityGrams: number,
  substitute: FoodData,
): number | null {
  const originalSnapshot = snapshotForFood(original, originalQuantityGrams);
  const target = original.category === FoodCategory.PROTEIN
    ? originalSnapshot.proteinGrams
    : original.category === FoodCategory.CARBOHYDRATE || original.category === FoodCategory.LEGUME
      ? originalSnapshot.carbsGrams
      : original.category === FoodCategory.FAT
        ? originalSnapshot.fatGrams
        : originalSnapshot.calories;
  const substitutePer100g = original.category === FoodCategory.PROTEIN
    ? substitute.proteinPer100g
    : original.category === FoodCategory.CARBOHYDRATE || original.category === FoodCategory.LEGUME
      ? substitute.carbsPer100g
      : original.category === FoodCategory.FAT
        ? substitute.fatPer100g
        : substitute.caloriesPer100g;
  if (target <= 0 || substitutePer100g <= 0) return null;
  return Math.round((target / substitutePer100g) * 100);
}

export function calculateFoodSubstitutions(
  original: FoodData,
  originalQuantityGrams: number,
  alternatives: Array<{ food: FoodData; priority: number }>,
  constraints: FoodConstraints,
  limit = 3,
): FoodSubstitutionCandidate[] {
  validateFoodQuantity(originalQuantityGrams);
  const originalSnapshot = snapshotForFood(original, originalQuantityGrams);
  return alternatives
    .filter((item) => item.food.id !== original.id && isFoodAllowed(item.food, constraints))
    .map((item) => {
      const quantityGrams = replacementQuantity(original, originalQuantityGrams, item.food);
      if (quantityGrams === null || quantityGrams <= 0 || quantityGrams > 2_000) return null;
      const snapshot = snapshotForFood(item.food, quantityGrams);
      return {
        food: item.food,
        quantityGrams,
        ...snapshot,
        differencePercent: differencePercent(originalSnapshot, snapshot, original.category),
        estimatedCostIqd: estimateFoodCostIqd(item.food, quantityGrams),
        priority: item.priority,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => {
      const common = Number(right.food.isIraqiCommon) - Number(left.food.isIraqiCommon);
      const budget = constraints.weeklyBudgetIqd && left.estimatedCostIqd !== null && right.estimatedCostIqd !== null
        ? left.estimatedCostIqd - right.estimatedCostIqd
        : 0;
      return left.priority - right.priority || common || budget || left.differencePercent - right.differencePercent;
    })
    .slice(0, limit)
    .map(({ priority: _priority, ...item }) => item);
}
