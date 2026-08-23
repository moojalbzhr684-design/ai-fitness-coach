import { describe, expect, it } from "vitest";
import { validateFoodMacros, validateFoodQuantity, validateMealsPerDay } from "./validation.js";

describe("nutrition validation", () => {
  it("accepts non-negative finite food macros", () => {
    expect(() => validateFoodMacros({
      caloriesPer100g: 100,
      proteinPer100g: 10,
      carbsPer100g: 0,
      fatPer100g: 1,
    })).not.toThrow();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid food macro value: %s",
    (proteinPer100g) => {
      expect(() => validateFoodMacros({
        caloriesPer100g: 100,
        proteinPer100g,
        carbsPer100g: 10,
        fatPer100g: 1,
      })).toThrow(RangeError);
    },
  );

  it.each([0, -10, 2_001, Number.NaN])("rejects invalid food quantity: %s", (quantity) => {
    expect(() => validateFoodQuantity(quantity)).toThrow(RangeError);
  });

  it.each([1, 7, 2.5])("rejects invalid meals per day: %s", (meals) => {
    expect(() => validateMealsPerDay(meals)).toThrow(RangeError);
  });
});
