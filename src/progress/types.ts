import type { Goal, ProgressDecisionAction } from "../generated/prisma/client.js";

export interface TrendMeasurement {
  weightKg: number;
  measuredAt: Date;
}

export interface WeightTrendResult {
  sufficientData: boolean;
  measurementCount: number;
  spanDays: number;
  weightTrendKgPerWeek: number | null;
  weightTrendPercentPerWeek: number | null;
}

export interface ProgressEvaluationInput {
  goal: Goal;
  trend: WeightTrendResult;
  nutritionAdherencePct: number;
  averageDailySteps: number | null;
  averageSleepHours: number | null;
  hungerRating: number;
  energyRating: number;
  currentCalories: number | null;
  minimumSafeCalories: number | null;
  hasGym: boolean;
}

export interface ProgressEvaluationResult {
  action: ProgressDecisionAction;
  weightTrendKgPerWeek: number | null;
  weightTrendPercentPerWeek: number | null;
  recommendedCaloriesDelta: number | null;
  recommendedStepsDelta: number | null;
  requiresCoachApproval: boolean;
  reasonCodes: string[];
  summary: string;
}
