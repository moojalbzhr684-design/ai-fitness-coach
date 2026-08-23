import { MINIMUM_TREND_SPAN_DAYS, TREND_WINDOW_DAYS } from "./rules.js";
import type { TrendMeasurement, WeightTrendResult } from "./types.js";

const DAY_MS = 86_400_000;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateWeightTrend(
  measurements: TrendMeasurement[],
  windowDays = TREND_WINDOW_DAYS,
  minimumSpanDays = MINIMUM_TREND_SPAN_DAYS,
): WeightTrendResult {
  const valid = measurements
    .filter((item) => Number.isFinite(item.weightKg)
      && item.weightKg > 0
      && Number.isFinite(item.measuredAt.getTime()))
    .sort((left, right) => left.measuredAt.getTime() - right.measuredAt.getTime());
  const latest = valid.at(-1);
  if (!latest) {
    return {
      sufficientData: false,
      measurementCount: 0,
      spanDays: 0,
      weightTrendKgPerWeek: null,
      weightTrendPercentPerWeek: null,
    };
  }
  const cutoff = latest.measuredAt.getTime() - windowDays * DAY_MS;
  const recent = valid.filter((item) => item.measuredAt.getTime() >= cutoff);
  const first = recent[0]!;
  const spanDays = (latest.measuredAt.getTime() - first.measuredAt.getTime()) / DAY_MS;
  if (recent.length < 2 || spanDays < minimumSpanDays) {
    return {
      sufficientData: false,
      measurementCount: recent.length,
      spanDays: round(spanDays, 1),
      weightTrendKgPerWeek: null,
      weightTrendPercentPerWeek: null,
    };
  }

  const xValues = recent.map((item) => (item.measuredAt.getTime() - first.measuredAt.getTime()) / DAY_MS);
  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = recent.reduce((sum, item) => sum + item.weightKg, 0) / recent.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < recent.length; index += 1) {
    const xDifference = xValues[index]! - xMean;
    numerator += xDifference * (recent[index]!.weightKg - yMean);
    denominator += xDifference ** 2;
  }
  if (denominator === 0) {
    return {
      sufficientData: false,
      measurementCount: recent.length,
      spanDays: round(spanDays, 1),
      weightTrendKgPerWeek: null,
      weightTrendPercentPerWeek: null,
    };
  }
  const kgPerWeek = (numerator / denominator) * 7;
  const percentPerWeek = (kgPerWeek / latest.weightKg) * 100;
  return {
    sufficientData: true,
    measurementCount: recent.length,
    spanDays: round(spanDays, 1),
    weightTrendKgPerWeek: round(kgPerWeek, 3),
    weightTrendPercentPerWeek: round(percentPerWeek, 3),
  };
}
