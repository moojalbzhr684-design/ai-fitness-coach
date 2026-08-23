import type { ProgressEvaluationResult } from "../progress/types.js";

export function buildAgentDecisionRecord(
  evaluation: ProgressEvaluationResult,
  currentCalories: number | null,
  averageDailySteps: number | null,
) {
  return {
    decisionType: "WEEKLY_PROGRESS_REVIEW",
    oldValue: {
      calories: currentCalories,
      averageDailySteps,
    },
    newValue: {
      action: evaluation.action,
      recommendedCalories: currentCalories !== null && evaluation.recommendedCaloriesDelta !== null
        ? currentCalories + evaluation.recommendedCaloriesDelta
        : currentCalories,
      recommendedCaloriesDelta: evaluation.recommendedCaloriesDelta,
      recommendedAverageDailySteps: averageDailySteps !== null && evaluation.recommendedStepsDelta !== null
        ? averageDailySteps + evaluation.recommendedStepsDelta
        : averageDailySteps,
      recommendedStepsDelta: evaluation.recommendedStepsDelta,
    },
    reason: evaluation.summary,
    requiresCoachApproval: evaluation.requiresCoachApproval,
  };
}

export function progressAuditEvents(
  checkInId: string,
  evaluationId: string,
  measurementId: string,
) {
  return [
    {
      action: "WEEKLY_CHECKIN_SUBMITTED",
      targetType: "WeeklyCheckIn",
      targetId: checkInId,
    },
    {
      action: "BODY_WEIGHT_LOGGED",
      targetType: "BodyMeasurement",
      targetId: measurementId,
    },
    {
      action: "PROGRESS_EVALUATED",
      targetType: "ProgressEvaluation",
      targetId: evaluationId,
    },
    {
      action: "PROGRESS_RECOMMENDATION_CREATED",
      targetType: "ProgressEvaluation",
      targetId: evaluationId,
    },
  ] as const;
}
