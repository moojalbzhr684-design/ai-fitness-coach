import type { FoodData } from "./types.js";
import { validateFoodQuantity } from "./validation.js";

export function estimateFoodCostIqd(
  food: Pick<FoodData, "estimatedPriceIqdPerKg">,
  quantityGrams: number,
): number | null {
  validateFoodQuantity(quantityGrams);
  const price = food.estimatedPriceIqdPerKg;
  if (price === null || !Number.isFinite(price) || price < 0) return null;
  return (quantityGrams / 1_000) * price;
}

export function estimateItemsCostIqd(
  items: Array<{
    food: Pick<FoodData, "estimatedPriceIqdPerKg">;
    quantityGrams: number;
  }>,
): number | null {
  let total = 0;
  for (const item of items) {
    const cost = estimateFoodCostIqd(item.food, item.quantityGrams);
    if (cost === null) return null;
    total += cost;
  }
  return Math.round(total);
}

export function estimatePlanCostIqd(
  meals: Array<{
    items: Array<{
      food: Pick<FoodData, "estimatedPriceIqdPerKg">;
      quantityGrams: number;
    }>;
  }>,
): { dailyCostIqd: number | null; weeklyCostIqd: number | null } {
  const dailyCostIqd = estimateItemsCostIqd(meals.flatMap((meal) => meal.items));
  return {
    dailyCostIqd,
    weeklyCostIqd: dailyCostIqd === null ? null : dailyCostIqd * 7,
  };
}
