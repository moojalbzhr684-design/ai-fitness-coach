import { describe, expect, it } from "vitest";
import { Goal, ProgressDecisionAction } from "../generated/prisma/client.js";
import { evaluateProgress } from "./evaluator.js";
import type { ProgressEvaluationInput, WeightTrendResult } from "./types.js";

const trend = (percent: number | null, sufficientData = true): WeightTrendResult => ({
  sufficientData,
  measurementCount: sufficientData ? 3 : 1,
  spanDays: sufficientData ? 14 : 0,
  weightTrendKgPerWeek: percent === null ? null : (percent / 100) * 80,
  weightTrendPercentPerWeek: percent,
});
const input = (goal: Goal, percent: number | null): ProgressEvaluationInput => ({
  goal,
  trend: trend(percent, percent !== null),
  nutritionAdherencePct: 90,
  averageDailySteps: 8_000,
  averageSleepHours: 7,
  hungerRating: 5,
  energyRating: 7,
  currentCalories: 2_200,
  minimumSafeCalories: 1_700,
  hasGym: true,
});

describe("progress evaluator", () => {
  it("collects more data when trend history is insufficient", () => {
    expect(evaluateProgress(input(Goal.FAT_LOSS, null)).action)
      .toBe(ProgressDecisionAction.COLLECT_MORE_DATA);
  });

  it("recommends one fat-loss adjustment for a high-adherence plateau", () => {
    const result = evaluateProgress(input(Goal.FAT_LOSS, 0));
    expect(result.action).toBe(ProgressDecisionAction.DECREASE_CALORIES);
    expect(result.recommendedCaloriesDelta).toBe(-150);
    expect(result.recommendedStepsDelta).toBeNull();
    expect(result.requiresCoachApproval).toBe(true);
  });

  it("uses steps as the single lever when plateaued steps are low", () => {
    const result = evaluateProgress({ ...input(Goal.FAT_LOSS, 0), averageDailySteps: 4_000 });
    expect(result.action).toBe(ProgressDecisionAction.INCREASE_STEPS);
    expect(result.recommendedStepsDelta).toBe(1_000);
    expect(result.recommendedCaloriesDelta).toBeNull();
  });

  it("reviews adherence instead of reducing calories when adherence is low", () => {
    const result = evaluateProgress({ ...input(Goal.FAT_LOSS, 0), nutritionAdherencePct: 70 });
    expect(result.action).toBe(ProgressDecisionAction.REVIEW_ADHERENCE);
    expect(result.recommendedCaloriesDelta).toBeNull();
  });

  it("keeps the plan for the desired fat-loss rate", () => {
    expect(evaluateProgress(input(Goal.FAT_LOSS, -0.5)).action)
      .toBe(ProgressDecisionAction.KEEP_CURRENT_PLAN);
  });

  it("increases calories when fat loss is excessive", () => {
    expect(evaluateProgress(input(Goal.FAT_LOSS, -1)).action)
      .toBe(ProgressDecisionAction.INCREASE_CALORIES);
  });

  it("routes poor recovery to coach review before an aggressive reduction", () => {
    const result = evaluateProgress({ ...input(Goal.FAT_LOSS, 0), hungerRating: 9 });
    expect(result.action).toBe(ProgressDecisionAction.COACH_REVIEW_REQUIRED);
    expect(result.recommendedCaloriesDelta).toBeNull();
  });

  it("blocks a calorie reduction below the Milestone 3 safety floor", () => {
    const result = evaluateProgress({
      ...input(Goal.FAT_LOSS, 0),
      currentCalories: 1_800,
      minimumSafeCalories: 1_700,
    });
    expect(result.action).toBe(ProgressDecisionAction.COACH_REVIEW_REQUIRED);
    expect(result.reasonCodes).toContain("CALORIE_SAFETY_FLOOR");
  });

  it("increases calories for slow muscle gain with high adherence", () => {
    expect(evaluateProgress(input(Goal.MUSCLE_GAIN, 0)).action)
      .toBe(ProgressDecisionAction.INCREASE_CALORIES);
  });

  it("keeps calories for desired muscle gain", () => {
    expect(evaluateProgress(input(Goal.MUSCLE_GAIN, 0.2)).action)
      .toBe(ProgressDecisionAction.KEEP_CURRENT_PLAN);
  });

  it("decreases calories for excessive muscle gain", () => {
    expect(evaluateProgress(input(Goal.MUSCLE_GAIN, 0.5)).action)
      .toBe(ProgressDecisionAction.DECREASE_CALORIES);
  });

  it("keeps a stable recomposition trend", () => {
    expect(evaluateProgress(input(Goal.RECOMPOSITION, 0)).action)
      .toBe(ProgressDecisionAction.KEEP_CURRENT_PLAN);
  });

  it("keeps a stable general-fitness trend", () => {
    expect(evaluateProgress(input(Goal.GENERAL_FITNESS, 0)).action)
      .toBe(ProgressDecisionAction.KEEP_CURRENT_PLAN);
  });

  it("stores standalone recommendations without pretending approval is required", () => {
    const result = evaluateProgress({ ...input(Goal.MUSCLE_GAIN, 0), hasGym: false });
    expect(result.action).toBe(ProgressDecisionAction.INCREASE_CALORIES);
    expect(result.requiresCoachApproval).toBe(false);
  });
});
