import { describe, expect, it } from "vitest";
import { calculateWeightTrend } from "./trend.js";

const day = (offset: number) => new Date(Date.UTC(2026, 7, 1 + offset));

describe("weight trend regression", () => {
  it("reports insufficient data when measurements do not span 14 days", () => {
    const result = calculateWeightTrend([
      { weightKg: 80, measuredAt: day(0) },
      { weightKg: 79.8, measuredAt: day(7) },
    ]);
    expect(result.sufficientData).toBe(false);
    expect(result.weightTrendKgPerWeek).toBeNull();
  });

  it("returns approximately zero for stable measurements", () => {
    const result = calculateWeightTrend([
      { weightKg: 80, measuredAt: day(0) },
      { weightKg: 80, measuredAt: day(7) },
      { weightKg: 80, measuredAt: day(14) },
    ]);
    expect(result.weightTrendKgPerWeek).toBeCloseTo(0, 3);
    expect(result.weightTrendPercentPerWeek).toBeCloseTo(0, 3);
  });

  it("returns a negative weekly slope for decreasing weight", () => {
    const result = calculateWeightTrend([
      { weightKg: 80, measuredAt: day(0) },
      { weightKg: 79.5, measuredAt: day(7) },
      { weightKg: 79, measuredAt: day(14) },
    ]);
    expect(result.weightTrendKgPerWeek).toBeCloseTo(-0.5, 2);
    expect(result.weightTrendPercentPerWeek).toBeCloseTo((-0.5 / 79) * 100, 2);
  });

  it("returns a positive weekly slope for increasing weight", () => {
    const result = calculateWeightTrend([
      { weightKg: 70, measuredAt: day(0) },
      { weightKg: 70.3, measuredAt: day(7) },
      { weightKg: 70.6, measuredAt: day(14) },
    ]);
    expect(result.weightTrendKgPerWeek).toBeGreaterThan(0);
  });

  it("handles irregular measurement dates with regression", () => {
    const result = calculateWeightTrend([
      { weightKg: 90, measuredAt: day(0) },
      { weightKg: 89.8, measuredAt: day(3) },
      { weightKg: 89.1, measuredAt: day(11) },
      { weightKg: 88.7, measuredAt: day(17) },
    ]);
    expect(result.sufficientData).toBe(true);
    expect(result.measurementCount).toBe(4);
    expect(result.weightTrendKgPerWeek).toBeLessThan(0);
  });
});
