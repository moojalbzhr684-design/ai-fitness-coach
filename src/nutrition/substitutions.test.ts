import { describe, expect, it } from "vitest";
import { foodSeeds } from "../../prisma/food-seed.js";
import type { FoodConstraints, FoodData } from "./types.js";
import { calculateFoodSubstitutions } from "./substitutions.js";

const foods = foodSeeds.map((item): FoodData => ({
  ...item,
  id: item.slug,
  dietaryTags: item.dietaryTags,
  allergenTags: item.allergenTags,
  isActive: true,
}));
const get = (slug: string) => {
  const result = foods.find((item) => item.slug === slug);
  if (!result) throw new Error(`Missing test food: ${slug}`);
  return result;
};
const constraints: FoodConstraints = {
  preferences: [],
  dislikedFoods: [],
  allergies: [],
  dietaryRestrictions: [],
  weeklyBudgetIqd: null,
};

describe("food substitutions", () => {
  it("matches a protein substitute primarily by protein", () => {
    const original = get("chicken-breast");
    const [result] = calculateFoodSubstitutions(
      original,
      150,
      [{ food: get("lean-beef"), priority: 1 }],
      constraints,
    );
    expect(result).toBeDefined();
    expect(result!.proteinGrams).toBeCloseTo((original.proteinPer100g * 150) / 100, 0);
    expect(result!.quantityGrams).not.toBe(150);
  });

  it("matches a carbohydrate substitute by carbohydrate and reports calorie difference", () => {
    const original = get("cooked-white-rice");
    const [result] = calculateFoodSubstitutions(
      original,
      200,
      [{ food: get("potatoes-boiled"), priority: 1 }],
      constraints,
    );
    expect(result!.carbsGrams).toBeCloseTo((original.carbsPer100g * 200) / 100, 0);
    expect(result!.differencePercent).toBeGreaterThanOrEqual(0);
  });

  it("hard-excludes allergy matches", () => {
    const result = calculateFoodSubstitutions(
      get("chicken-breast"),
      150,
      [{ food: get("tuna-canned-water"), priority: 1 }],
      { ...constraints, allergies: ["fish"] },
    );
    expect(result).toEqual([]);
  });

  it("excludes disliked foods", () => {
    const result = calculateFoodSubstitutions(
      get("chicken-breast"),
      150,
      [{ food: get("lean-beef"), priority: 1 }],
      { ...constraints, dislikedFoods: ["lean beef"] },
    );
    expect(result).toEqual([]);
  });

  it("rejects invalid original quantities", () => {
    expect(() => calculateFoodSubstitutions(
      get("chicken-breast"),
      0,
      [{ food: get("lean-beef"), priority: 1 }],
      constraints,
    )).toThrow(RangeError);
  });
});
