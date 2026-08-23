import { Goal, ProgressDecisionAction } from "../generated/prisma/client.js";
import {
  DEFAULT_CALORIE_ADJUSTMENT,
  DEFAULT_STEPS_ADJUSTMENT,
  GOAL_TREND_RANGES,
  HIGH_HUNGER_RATING,
  LOW_ENERGY_RATING,
  LOW_SLEEP_HOURS,
  LOW_STEPS_THRESHOLD,
  MAX_CALORIE_ADJUSTMENT,
  NUTRITION_ADHERENCE_GATE_PCT,
  RECOMMENDED_STEPS_CEILING,
} from "./rules.js";
import type { ProgressEvaluationInput, ProgressEvaluationResult } from "./types.js";

interface DecisionOptions {
  action: ProgressDecisionAction;
  reasonCodes: string[];
  summary: string;
  caloriesDelta?: number;
  stepsDelta?: number;
}

function decision(input: ProgressEvaluationInput, options: DecisionOptions): ProgressEvaluationResult {
  const caloriesDelta = options.caloriesDelta ?? null;
  const stepsDelta = options.stepsDelta ?? null;
  const planChange = caloriesDelta !== null || stepsDelta !== null;
  return {
    action: options.action,
    weightTrendKgPerWeek: input.trend.weightTrendKgPerWeek,
    weightTrendPercentPerWeek: input.trend.weightTrendPercentPerWeek,
    recommendedCaloriesDelta: caloriesDelta,
    recommendedStepsDelta: stepsDelta,
    requiresCoachApproval: input.hasGym && (planChange || options.action === ProgressDecisionAction.COACH_REVIEW_REQUIRED),
    reasonCodes: options.reasonCodes,
    summary: options.summary,
  };
}

function poorRecovery(input: ProgressEvaluationInput): boolean {
  return input.hungerRating >= HIGH_HUNGER_RATING
    || input.energyRating <= LOW_ENERGY_RATING
    || (input.averageSleepHours !== null && input.averageSleepHours < LOW_SLEEP_HOURS);
}

function adherenceReview(input: ProgressEvaluationInput): ProgressEvaluationResult {
  return decision(input, {
    action: ProgressDecisionAction.REVIEW_ADHERENCE,
    reasonCodes: ["ADHERENCE_BELOW_GATE"],
    summary: "قبل ما نغير الخطة، خل نثبت الالتزام بصورة أفضل ونجمع بيانات أوضح.",
  });
}

function recoveryReview(input: ProgressEvaluationInput): ProgressEvaluationResult {
  return decision(input, {
    action: ProgressDecisionAction.COACH_REVIEW_REQUIRED,
    reasonCodes: ["LOW_RECOVERY_SIGNAL"],
    summary: "إشارات الاستشفاء تحتاج مراجعة قبل اقتراح تقليل السعرات أو زيادة النشاط.",
  });
}

function calorieAdjustment(
  input: ProgressEvaluationInput,
  direction: "increase" | "decrease",
  reasonCode: string,
  summary: string,
  amount = DEFAULT_CALORIE_ADJUSTMENT,
): ProgressEvaluationResult {
  const safeAmount = Math.min(Math.abs(amount), MAX_CALORIE_ADJUSTMENT);
  const delta = direction === "increase" ? safeAmount : -safeAmount;
  if (direction === "decrease") {
    if (input.currentCalories === null || input.minimumSafeCalories === null
      || input.currentCalories + delta < input.minimumSafeCalories) {
      return decision(input, {
        action: ProgressDecisionAction.COACH_REVIEW_REQUIRED,
        reasonCodes: [reasonCode, "CALORIE_SAFETY_FLOOR"],
        summary: "التقليل المقترح يتعارض ويا حد الأمان؛ نحتاج مراجعة بدون تغيير الخطة.",
      });
    }
  }
  return decision(input, {
    action: direction === "increase"
      ? ProgressDecisionAction.INCREASE_CALORIES
      : ProgressDecisionAction.DECREASE_CALORIES,
    reasonCodes: [reasonCode],
    summary,
    caloriesDelta: delta,
  });
}

export function evaluateProgress(input: ProgressEvaluationInput): ProgressEvaluationResult {
  if (!input.trend.sufficientData || input.trend.weightTrendPercentPerWeek === null) {
    return decision(input, {
      action: ProgressDecisionAction.COLLECT_MORE_DATA,
      reasonCodes: ["INSUFFICIENT_TREND_DATA"],
      summary: "نحتاج بيانات وزن تمتد أسبوعين على الأقل قبل ما نقترح تغيير.",
    });
  }
  const trend = input.trend.weightTrendPercentPerWeek;
  const range = GOAL_TREND_RANGES[input.goal];

  if (input.goal === Goal.FAT_LOSS) {
    if (trend < range.minimumPercentPerWeek) {
      return calorieAdjustment(
        input,
        "increase",
        "FAT_LOSS_TOO_FAST",
        "نزول الوزن أسرع من النطاق المحافظ؛ التوصية زيادة بسيطة بالسعرات.",
      );
    }
    if (trend <= range.maximumPercentPerWeek) {
      return decision(input, {
        action: ProgressDecisionAction.KEEP_CURRENT_PLAN,
        reasonCodes: ["FAT_LOSS_RATE_ON_TARGET"],
        summary: "اتجاه نزول الوزن ضمن النطاق المناسب؛ استمر على نفس الخطة.",
      });
    }
    if (input.nutritionAdherencePct < NUTRITION_ADHERENCE_GATE_PCT) return adherenceReview(input);
    if (poorRecovery(input)) return recoveryReview(input);
    if (input.averageDailySteps !== null
      && input.averageDailySteps < LOW_STEPS_THRESHOLD
      && input.averageDailySteps + DEFAULT_STEPS_ADJUSTMENT <= RECOMMENDED_STEPS_CEILING) {
      return decision(input, {
        action: ProgressDecisionAction.INCREASE_STEPS,
        reasonCodes: ["FAT_LOSS_SLOW", "LOW_DAILY_STEPS"],
        summary: "اتجاه الوزن بطيء والالتزام جيد؛ التوصية زيادة معتدلة بالخطوات اليومية.",
        stepsDelta: DEFAULT_STEPS_ADJUSTMENT,
      });
    }
    return calorieAdjustment(
      input,
      "decrease",
      "FAT_LOSS_SLOW",
      "اتجاه الوزن أبطأ من المطلوب مع التزام جيد؛ التوصية تقليل بسيط بالسعرات.",
    );
  }

  if (input.goal === Goal.MUSCLE_GAIN) {
    if (trend < range.minimumPercentPerWeek) {
      if (input.nutritionAdherencePct < NUTRITION_ADHERENCE_GATE_PCT) return adherenceReview(input);
      return calorieAdjustment(
        input,
        "increase",
        "MUSCLE_GAIN_TOO_SLOW",
        "زيادة الوزن أبطأ من النطاق المستهدف؛ التوصية زيادة بسيطة بالسعرات.",
      );
    }
    if (trend <= range.maximumPercentPerWeek) {
      return decision(input, {
        action: ProgressDecisionAction.KEEP_CURRENT_PLAN,
        reasonCodes: ["MUSCLE_GAIN_RATE_ON_TARGET"],
        summary: "اتجاه زيادة الوزن ضمن النطاق المحافظ؛ استمر على نفس الخطة.",
      });
    }
    if (input.nutritionAdherencePct < NUTRITION_ADHERENCE_GATE_PCT) return adherenceReview(input);
    if (poorRecovery(input)) return recoveryReview(input);
    return calorieAdjustment(
      input,
      "decrease",
      "MUSCLE_GAIN_TOO_FAST",
      "زيادة الوزن أسرع من النطاق المحافظ؛ التوصية تقليل بسيط بالسعرات.",
    );
  }

  if (input.goal === Goal.RECOMPOSITION) {
    if (trend >= -0.5 && trend <= 0.35) {
      return decision(input, {
        action: ProgressDecisionAction.KEEP_CURRENT_PLAN,
        reasonCodes: ["RECOMPOSITION_STABLE"],
        summary: "الوزن مستقر ضمن نطاق مناسب لإعادة تركيب الجسم؛ لا نحتاج تغيير حالياً.",
      });
    }
    if (input.nutritionAdherencePct < NUTRITION_ADHERENCE_GATE_PCT) return adherenceReview(input);
    if (trend < -0.5) {
      return calorieAdjustment(input, "increase", "RECOMPOSITION_LOSS_TOO_FAST", "النزول واضح أكثر من المطلوب؛ التوصية زيادة بسيطة بالسعرات.", 100);
    }
    if (poorRecovery(input)) return recoveryReview(input);
    return calorieAdjustment(input, "decrease", "RECOMPOSITION_GAIN_TOO_FAST", "الزيادة واضحة أكثر من المطلوب؛ التوصية تقليل بسيط بالسعرات.", 100);
  }

  if (trend >= range.minimumPercentPerWeek && trend <= range.maximumPercentPerWeek) {
    return decision(input, {
      action: ProgressDecisionAction.KEEP_CURRENT_PLAN,
      reasonCodes: [input.goal === Goal.STRENGTH ? "STRENGTH_TREND_STABLE" : "GENERAL_FITNESS_TREND_STABLE"],
      summary: "اتجاه الوزن مستقر؛ ماكو داعي نغير الخطة حالياً.",
    });
  }
  return decision(input, {
    action: ProgressDecisionAction.COACH_REVIEW_REQUIRED,
    reasonCodes: ["WEIGHT_TREND_OUTSIDE_MAINTENANCE_RANGE"],
    summary: "اتجاه الوزن خارج نطاق الاستقرار؛ الأفضل مراجعة الوضع بدون تغيير تلقائي.",
  });
}
