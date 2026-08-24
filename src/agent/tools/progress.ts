import { getLatestCheckIn, getLatestProgressDecision, getProgressSummary, getRecentMeasurements } from "../../services/progress.js";
import { emptyToolInputSchema, recentMeasurementsInputSchema } from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

export const progressTools: AgentToolDefinition[] = [
  {
    name: "get_progress_summary",
    description: "Read a database-derived summary of the authenticated user's starting/current weight, change, waist, trend, and check-in count.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const summary = await getProgressSummary(actor.userId);
      if (!summary) return null;
      return {
        startingWeightKg: summary.startingWeightKg,
        currentWeightKg: summary.currentWeightKg,
        totalChangeKg: summary.totalChangeKg,
        latestWaistCm: summary.latestWaistCm,
        trend: summary.trend,
        checkInCount: summary.checkInCount,
      };
    },
  },
  {
    name: "get_latest_checkin",
    description: "Read the authenticated user's latest evaluated check-in and its stored evaluation/reason codes.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const checkIn = await getLatestCheckIn(actor.userId);
      if (!checkIn) return null;
      return {
        weightKg: checkIn.weightKg,
        waistCm: checkIn.waistCm,
        nutritionAdherencePct: checkIn.nutritionAdherencePct,
        workoutsCompleted: checkIn.workoutsCompleted,
        trackedWorkoutsCompleted: checkIn.trackedWorkoutsCompleted,
        averageDailySteps: checkIn.averageDailySteps,
        averageSleepHours: checkIn.averageSleepHours,
        hungerRating: checkIn.hungerRating,
        energyRating: checkIn.energyRating,
        notes: checkIn.notes,
        evaluatedAt: checkIn.evaluatedAt,
        evaluation: checkIn.evaluation ? {
          action: checkIn.evaluation.action,
          weightTrendKgPerWeek: checkIn.evaluation.weightTrendKgPerWeek,
          weightTrendPercentPerWeek: checkIn.evaluation.weightTrendPercentPerWeek,
          recommendedCaloriesDelta: checkIn.evaluation.recommendedCaloriesDelta,
          recommendedStepsDelta: checkIn.evaluation.recommendedStepsDelta,
          requiresCoachApproval: checkIn.evaluation.requiresCoachApproval,
          reasonCodes: checkIn.evaluation.reasonCodes,
          summary: checkIn.evaluation.summary,
        } : null,
      };
    },
  },
  {
    name: "get_recent_measurements",
    description: "Read up to twelve recent body weight/waist measurements for the authenticated user.",
    category: ToolCategory.READ,
    schema: recentMeasurementsInputSchema,
    handler: async (input, { actor }) => getRecentMeasurements(actor.userId, recentMeasurementsInputSchema.parse(input).limit),
  },
  {
    name: "get_latest_progress_decision",
    description: "Read the authenticated user's latest stored progress AgentDecision and exact stored reason. Use this to explain why a change was or was not recommended.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => getLatestProgressDecision(actor.userId),
  },
];
