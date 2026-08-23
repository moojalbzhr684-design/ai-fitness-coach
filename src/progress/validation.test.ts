import { describe, expect, it } from "vitest";
import {
  validateAverageSleepHours,
  validateEnergyRating,
  validateHungerRating,
  validateNutritionAdherencePct,
  validateWeightKg,
} from "./validation.js";

describe("check-in validation", () => {
  it.each([34.9, 300.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid weight: %s",
    (value) => expect(() => validateWeightKg(value)).toThrow(RangeError),
  );

  it.each([-1, 101, 80.5])(
    "rejects invalid adherence: %s",
    (value) => expect(() => validateNutritionAdherencePct(value)).toThrow(RangeError),
  );

  it.each([-0.1, 16.1, Number.NaN])(
    "rejects invalid sleep: %s",
    (value) => expect(() => validateAverageSleepHours(value)).toThrow(RangeError),
  );

  it.each([0, 11, 2.5])(
    "rejects invalid hunger: %s",
    (value) => expect(() => validateHungerRating(value)).toThrow(RangeError),
  );

  it.each([0, 11, 9.5])(
    "rejects invalid energy: %s",
    (value) => expect(() => validateEnergyRating(value)).toThrow(RangeError),
  );
});
