import { describe, expect, it } from "vitest";
import { estimateFoodCostIqd, estimateItemsCostIqd, estimatePlanCostIqd } from "./budget.js";

const pricedFood = { estimatedPriceIqdPerKg: 8_000 };

describe("nutrition budget estimates", () => {
  it("calculates quantity cost from the per-kilogram estimate", () => {
    expect(estimateFoodCostIqd(pricedFood, 250)).toBe(2_000);
  });

  it("calculates daily and weekly costs", () => {
    const items = [
      { food: pricedFood, quantityGrams: 250 },
      { food: { estimatedPriceIqdPerKg: 2_000 }, quantityGrams: 500 },
    ];
    expect(estimateItemsCostIqd(items)).toBe(3_000);
    expect(estimatePlanCostIqd([{ items }])).toEqual({
      dailyCostIqd: 3_000,
      weeklyCostIqd: 21_000,
    });
  });

  it("handles a missing price without inventing a total", () => {
    expect(estimateFoodCostIqd({ estimatedPriceIqdPerKg: null }, 100)).toBeNull();
    expect(estimateItemsCostIqd([
      { food: pricedFood, quantityGrams: 100 },
      { food: { estimatedPriceIqdPerKg: null }, quantityGrams: 100 },
    ])).toBeNull();
  });
});
