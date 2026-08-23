import { InlineKeyboard, type Context } from "grammy";
import {
  CheckInStep,
  ProgressDecisionAction,
} from "../generated/prisma/client.js";
import {
  CheckInError,
  completeDraftCheckIn,
  getDraftCheckIn,
  getOrCreateDraftCheckIn,
  logManualWeight,
  saveCheckInAnswer,
} from "../services/checkins.js";
import { getCheckInStatus, getProgressSummary } from "../services/progress.js";
import { findUserByTelegramId } from "../services/users.js";
import { normalizeNumericText } from "../utils/text.js";

async function currentUser(ctx: Context) {
  if (!ctx.from) return null;
  return findUserByTelegramId(BigInt(ctx.from.id));
}

function ratingKeyboard(step: "hunger" | "energy"): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let value = 1; value <= 10; value += 1) {
    keyboard.text(String(value), `checkin:${step}:${value}`);
    if (value === 5) keyboard.row();
  }
  return keyboard;
}

export async function sendCheckInPrompt(ctx: Context, step: CheckInStep): Promise<void> {
  switch (step) {
    case CheckInStep.WEIGHT:
      await ctx.reply("⚖️ شكد وزنك هسه بالكيلو؟\nمثال: 78.4");
      break;
    case CheckInStep.WAIST:
      await ctx.reply("📏 إذا تعرف قياس خصرك بالسنتيمتر ارسله.\nإذا ما تعرف استخدم /skip");
      break;
    case CheckInStep.NUTRITION_ADHERENCE:
      await ctx.reply("🍽 تقريباً شكد التزمت بنظام الأكل هذا الأسبوع؟", {
        reply_markup: new InlineKeyboard()
          .text("100%", "checkin:adherence:100")
          .text("90%", "checkin:adherence:90")
          .text("80%", "checkin:adherence:80")
          .row()
          .text("70%", "checkin:adherence:70")
          .text("أقل من 70%", "checkin:adherence:69"),
      });
      break;
    case CheckInStep.WORKOUTS_COMPLETED:
      await ctx.reply("🏋️ شكد تمرين كملت هذا الأسبوع؟\nاكتب رقم من 0 إلى 7.");
      break;
    case CheckInStep.STEPS:
      await ctx.reply("🚶 شكد تقريباً معدل خطواتك باليوم؟\nإذا ما تعرف استخدم /skip");
      break;
    case CheckInStep.SLEEP:
      await ctx.reply("😴 بالمعدل شكد ساعة تنام باليوم؟\nمثال: 6.5 أو 7 أو 8");
      break;
    case CheckInStep.HUNGER:
      await ctx.reply("🍴 شكد كان مستوى الجوع عندك هذا الأسبوع؟\n1 = تقريباً ماكو جوع\n10 = جوع قوي جداً", {
        reply_markup: ratingKeyboard("hunger"),
      });
      break;
    case CheckInStep.ENERGY:
      await ctx.reply("⚡ شكد كان مستوى طاقتك بشكل عام؟\n1 = واطية جداً\n10 = ممتازة", {
        reply_markup: ratingKeyboard("energy"),
      });
      break;
    case CheckInStep.NOTES:
      await ctx.reply("📝 عندك ملاحظة تريد تضيفها عن هذا الأسبوع؟\nإذا ماكو استخدم /skip");
      break;
    case CheckInStep.COMPLETE:
      await ctx.reply("جاري تحليل المتابعة بصورة منظمة...");
      break;
  }
}

function parseNumber(raw: string): number | null {
  const normalized = normalizeNumericText(raw.trim());
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseInteger(raw: string): number | null {
  const value = parseNumber(raw);
  return value !== null && Number.isInteger(value) ? value : null;
}

function actionLabel(action: ProgressDecisionAction): string {
  const labels: Record<ProgressDecisionAction, string> = {
    [ProgressDecisionAction.COLLECT_MORE_DATA]: "نجمع بيانات أكثر قبل أي تغيير.",
    [ProgressDecisionAction.KEEP_CURRENT_PLAN]: "استمر على نفس الخطة حالياً.",
    [ProgressDecisionAction.DECREASE_CALORIES]: "تقليل بسيط بالسعرات مقترح.",
    [ProgressDecisionAction.INCREASE_CALORIES]: "زيادة بسيطة بالسعرات مقترحة.",
    [ProgressDecisionAction.INCREASE_STEPS]: "زيادة معتدلة بالخطوات مقترحة.",
    [ProgressDecisionAction.REVIEW_ADHERENCE]: "نراجع الالتزام قبل تغيير الخطة.",
    [ProgressDecisionAction.COACH_REVIEW_REQUIRED]: "نحتاج مراجعة قبل أي تغيير.",
  };
  return labels[action];
}

async function completeAndReply(ctx: Context, userId: string): Promise<void> {
  const result = await completeDraftCheckIn(userId);
  const checkIn = result.checkIn;
  const evaluation = result.evaluation;
  const trend = evaluation.weightTrendPercentPerWeek === null
    ? "نحتاج بيانات أكثر"
    : `${evaluation.weightTrendPercentPerWeek > 0 ? "+" : ""}${evaluation.weightTrendPercentPerWeek.toFixed(2)}% بالأسبوع`;
  const recommendation = evaluation.recommendedCaloriesDelta !== null
    ? `${evaluation.recommendedCaloriesDelta > 0 ? "+" : ""}${evaluation.recommendedCaloriesDelta} سعرة/يوم`
    : evaluation.recommendedStepsDelta !== null
      ? `+${evaluation.recommendedStepsDelta} خطوة/يوم`
      : null;
  await ctx.reply([
    "✅ كملنا متابعة هذا الأسبوع",
    "",
    `الوزن: ${checkIn.weightKg} كغم`,
    `الالتزام بالأكل: ${checkIn.nutritionAdherencePct}%`,
    `التمارين المبلغ عنها: ${checkIn.workoutsCompleted}`,
    `التمارين المسجلة: ${checkIn.trackedWorkoutsCompleted ?? 0}`,
    `النوم: ${checkIn.averageSleepHours} ساعات`,
    "",
    "━━━━━━━━━━",
    "📊 تحليل التقدم",
    "",
    `اتجاه الوزن: ${trend}`,
    `قرار النظام: ${actionLabel(evaluation.action)}`,
    evaluation.summary,
    ...(recommendation ? [`التوصية المنظمة: ${recommendation}`] : []),
    ...(evaluation.recommendedCaloriesDelta !== null || evaluation.recommendedStepsDelta !== null
      ? ["هذا اقتراح فقط وما تم تطبيق أي تغيير."]
      : []),
    ...(evaluation.requiresCoachApproval ? ["بانتظار مراجعة المدرب قبل أي تطبيق مستقبلي."] : []),
  ].join("\n"));
}

export async function handleCheckInCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }
  try {
    const result = await getOrCreateDraftCheckIn(user.id);
    if (result.resumed) await ctx.reply("نكمل المتابعة من المكان اللي وقفنا بيه.");
    if (result.checkIn.currentStep === CheckInStep.COMPLETE) {
      await completeAndReply(ctx, user.id);
      return;
    }
    await sendCheckInPrompt(ctx, result.checkIn.currentStep);
  } catch (error) {
    if (error instanceof CheckInError) {
      await ctx.reply(
        error.code === "RECENT_CHECKIN"
          ? "سويت متابعة قبل فترة قصيرة. عادةً الأفضل نخلي المتابعة أسبوعية؛ جرّب بعد مرور 5 أيام."
          : "كمل الإعداد أولاً عن طريق /start.",
      );
      return;
    }
    throw error;
  }
}

async function saveAndContinue(
  ctx: Context,
  userId: string,
  expectedStep: CheckInStep,
  nextStep: CheckInStep,
  data: Parameters<typeof saveCheckInAnswer>[0]["data"],
): Promise<void> {
  try {
    await saveCheckInAnswer({ userId, expectedStep, nextStep, data });
    if (nextStep === CheckInStep.COMPLETE) {
      await completeAndReply(ctx, userId);
    } else {
      await sendCheckInPrompt(ctx, nextStep);
    }
  } catch (error) {
    if (error instanceof CheckInError) {
      await ctx.reply("القيمة مو صالحة أو الخطوة تغيرت. استخدم /checkin حتى نكمل من الخطوة الحالية.");
      return;
    }
    throw error;
  }
}

export async function handleCheckInDraftText(
  ctx: Context,
  userId: string,
  text: string,
): Promise<boolean> {
  const draft = await getDraftCheckIn(userId);
  if (!draft) return false;
  switch (draft.currentStep) {
    case CheckInStep.WEIGHT: {
      const value = parseNumber(text);
      if (value === null) {
        await ctx.reply("اكتب الوزن بالكيلو كرقم، مثال: 78.4");
        return true;
      }
      await saveAndContinue(ctx, userId, draft.currentStep, CheckInStep.WAIST, { weightKg: value });
      return true;
    }
    case CheckInStep.WAIST: {
      const value = parseNumber(text);
      if (value === null) {
        await ctx.reply("اكتب قياس الخصر بالسنتيمتر أو استخدم /skip.");
        return true;
      }
      await saveAndContinue(ctx, userId, draft.currentStep, CheckInStep.NUTRITION_ADHERENCE, { waistCm: value });
      return true;
    }
    case CheckInStep.NUTRITION_ADHERENCE:
      await ctx.reply("اختار نسبة الالتزام من الأزرار حتى نكمل.");
      return true;
    case CheckInStep.WORKOUTS_COMPLETED: {
      const value = parseInteger(text);
      if (value === null) {
        await ctx.reply("اكتب عدد التمارين رقم صحيح من 0 إلى 7.");
        return true;
      }
      await saveAndContinue(ctx, userId, draft.currentStep, CheckInStep.STEPS, { workoutsCompleted: value });
      return true;
    }
    case CheckInStep.STEPS: {
      const value = parseInteger(text);
      if (value === null) {
        await ctx.reply("اكتب معدل الخطوات كرقم صحيح أو استخدم /skip.");
        return true;
      }
      await saveAndContinue(ctx, userId, draft.currentStep, CheckInStep.SLEEP, { averageDailySteps: value });
      return true;
    }
    case CheckInStep.SLEEP: {
      const value = parseNumber(text);
      if (value === null) {
        await ctx.reply("اكتب ساعات النوم كرقم، مثال: 6.5");
        return true;
      }
      await saveAndContinue(ctx, userId, draft.currentStep, CheckInStep.HUNGER, { averageSleepHours: value });
      return true;
    }
    case CheckInStep.HUNGER:
    case CheckInStep.ENERGY:
      await ctx.reply("اختار التقييم من الأزرار حتى نكمل.");
      return true;
    case CheckInStep.NOTES:
      await saveAndContinue(ctx, userId, draft.currentStep, CheckInStep.COMPLETE, { notes: text });
      return true;
    case CheckInStep.COMPLETE:
      await completeAndReply(ctx, userId);
      return true;
  }
}

export async function handleCheckInCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const user = await currentUser(ctx);
  const data = ctx.callbackQuery?.data;
  if (!user || !data) return;
  const [, type, rawValue] = data.split(":");
  const value = rawValue ? parseInteger(rawValue) : null;
  if (value === null) return;
  if (type === "adherence") {
    await saveAndContinue(ctx, user.id, CheckInStep.NUTRITION_ADHERENCE, CheckInStep.WORKOUTS_COMPLETED, { nutritionAdherencePct: value });
  } else if (type === "hunger") {
    await saveAndContinue(ctx, user.id, CheckInStep.HUNGER, CheckInStep.ENERGY, { hungerRating: value });
  } else if (type === "energy") {
    await saveAndContinue(ctx, user.id, CheckInStep.ENERGY, CheckInStep.NOTES, { energyRating: value });
  }
}

export async function handleSkipCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) return;
  const draft = await getDraftCheckIn(user.id);
  if (!draft) {
    await ctx.reply("ما عندك متابعة مفتوحة حالياً.");
    return;
  }
  if (draft.currentStep === CheckInStep.WAIST) {
    await saveAndContinue(ctx, user.id, draft.currentStep, CheckInStep.NUTRITION_ADHERENCE, { waistCm: null });
  } else if (draft.currentStep === CheckInStep.STEPS) {
    await saveAndContinue(ctx, user.id, draft.currentStep, CheckInStep.SLEEP, { averageDailySteps: null });
  } else if (draft.currentStep === CheckInStep.NOTES) {
    await saveAndContinue(ctx, user.id, draft.currentStep, CheckInStep.COMPLETE, { notes: null });
  } else {
    await ctx.reply("هاي الخطوة مطلوبة وما نكدر نتجاوزها.");
  }
}

export async function handleWeightCommand(ctx: Context, raw: string): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const weightKg = parseNumber(raw);
  if (weightKg === null) {
    await ctx.reply("الصيغة: /weight <الوزن بالكيلو>\nمثال: /weight 78.2");
    return;
  }
  try {
    await logManualWeight(user.id, weightKg);
    await ctx.reply(`✅ انحفظ وزنك: ${weightKg} كغم\nهذا سجل وزن فقط وما أنشأ Check-in أسبوعي.`);
  } catch (error) {
    if (error instanceof CheckInError) {
      await ctx.reply("الوزن لازم يكون بين 35 و300 كغم.");
      return;
    }
    throw error;
  }
}

function formatTrend(value: number | null, unit: string): string {
  if (value === null) return "نحتاج بيانات أكثر";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} ${unit}`;
}

export async function handleProgressCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const progress = await getProgressSummary(user.id);
  if (!progress || progress.currentWeightKg === null) {
    await ctx.reply("ما عدنا بيانات وزن كافية بعد. استخدم /weight أو /checkin.");
    return;
  }
  const latest = progress.latestCheckIn;
  const daysAgo = latest?.evaluatedAt
    ? Math.floor((Date.now() - latest.evaluatedAt.getTime()) / 86_400_000)
    : null;
  await ctx.reply([
    "📊 تقدمك",
    "",
    `البداية: ${progress.startingWeightKg?.toFixed(1) ?? "غير محدد"} كغم`,
    `الحالي: ${progress.currentWeightKg.toFixed(1)} كغم`,
    `التغيير: ${progress.totalChangeKg !== null && progress.totalChangeKg > 0 ? "+" : ""}${progress.totalChangeKg?.toFixed(1) ?? "غير محدد"} كغم`,
    `الاتجاه الحالي: ${formatTrend(progress.trend.weightTrendKgPerWeek, "كغم / أسبوع")}`,
    `النسبة: ${formatTrend(progress.trend.weightTrendPercentPerWeek, "% / أسبوع")}`,
    ...(progress.latestWaistCm === null ? [] : [`آخر قياس خصر: ${progress.latestWaistCm} سم`]),
    "",
    `عدد المتابعات: ${progress.checkInCount}`,
    ...(latest ? [
      `آخر Check-in: ${daysAgo === 0 ? "اليوم" : `قبل ${daysAgo} أيام`}`,
      `آخر التزام: ${latest.nutritionAdherencePct}%`,
      `التمارين: ${latest.workoutsCompleted}`,
      `آخر قرار: ${latest.evaluation?.summary ?? "قيد التقييم"}`,
    ] : []),
  ].join("\n"));
}

export async function handleCheckInStatusCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const status = await getCheckInStatus(user.id);
  if (status.draft) {
    await ctx.reply(`عندك متابعة غير مكتملة عند خطوة ${status.draft.currentStep}.\nاستخدم /checkin حتى تكملها.`);
    return;
  }
  if (!status.latest) {
    await ctx.reply("ما عندك Check-in سابق. استخدم /checkin حتى تبدأ أول متابعة.");
    return;
  }
  await ctx.reply([
    `آخر متابعة: ${status.latest.status}`,
    `التاريخ: ${(status.latest.evaluatedAt ?? status.latest.submittedAt ?? status.latest.createdAt).toLocaleDateString("ar-IQ")}`,
    `آخر توصية: ${status.latest.evaluation?.summary ?? "قيد التقييم"}`,
    "أي تغيير يبقى توصية فقط وما ينطبق تلقائياً.",
  ].join("\n"));
}
