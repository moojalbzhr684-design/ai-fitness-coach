import type { Goal } from "../generated/prisma/client.js";

export const TREND_WINDOW_DAYS = 21;
export const MINIMUM_TREND_SPAN_DAYS = 14;
export const NUTRITION_ADHERENCE_GATE_PCT = 85;
export const DEFAULT_CALORIE_ADJUSTMENT = 150;
export const MAX_CALORIE_ADJUSTMENT = 200;
export const DEFAULT_STEPS_ADJUSTMENT = 1_000;
export const LOW_STEPS_THRESHOLD = 7_000;
export const RECOMMENDED_STEPS_CEILING = 15_000;
export const LOW_SLEEP_HOURS = 5;
export const HIGH_HUNGER_RATING = 9;
export const LOW_ENERGY_RATING = 2;
export const RECENT_CHECKIN_WARNING_DAYS = 5;

export interface GoalTrendRange {
  minimumPercentPerWeek: number;
  maximumPercentPerWeek: number;
}

export const GOAL_TREND_RANGES: Readonly<Record<Goal, GoalTrendRange>> = {
  FAT_LOSS: { minimumPercentPerWeek: -0.75, maximumPercentPerWeek: -0.25 },
  MUSCLE_GAIN: { minimumPercentPerWeek: 0.1, maximumPercentPerWeek: 0.35 },
  RECOMPOSITION: { minimumPercentPerWeek: -0.25, maximumPercentPerWeek: 0.15 },
  STRENGTH: { minimumPercentPerWeek: -0.25, maximumPercentPerWeek: 0.35 },
  GENERAL_FITNESS: { minimumPercentPerWeek: -0.5, maximumPercentPerWeek: 0.5 },
};
