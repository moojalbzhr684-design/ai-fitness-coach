import { InlineKeyboard, type Context } from "grammy";
import { OnboardingStep, WorkoutSplit } from "../generated/prisma/client.js";
import {
  generateInitialWorkoutProgram,
  getActiveWorkoutProgram,
  getWorkoutDay,
  WorkoutProgramError,
} from "../services/workout-programs.js";
import {
  completeWorkoutSession,
  getCurrentWorkoutSession,
  logExerciseSet,
  startWorkoutSession,
  WorkoutSessionError,
} from "../services/workout-sessions.js";
import { findUserByTelegramId } from "../services/users.js";
import { normalizeNumericText } from "../utils/text.js";
import { getActiveGymMemberships, resolveGymMembership } from "../auth/gym-scope.js";

const splitLabels: Record<WorkoutSplit, string> = {
  [WorkoutSplit.FULL_BODY]: "Full Body",
  [WorkoutSplit.UPPER_LOWER]: "Upper / Lower",
  [WorkoutSplit.PUSH_PULL_LEGS]: "Push / Pull / Legs",
  [WorkoutSplit.CUSTOM]: "Custom",
};

async function currentUser(ctx: Context) {
  if (!ctx.from) return null;
  return findUserByTelegramId(BigInt(ctx.from.id));
}
function dayKeyboard(days: Array<{ id: string; dayNumber: number; name: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const day of days) {
    keyboard.text(`اليوم ${day.dayNumber} — ${day.name}`, `workout:day:${day.id}`).row();
  }
  return keyboard;
}

function programText(program: {
  split: WorkoutSplit;
  trainingDaysPerWeek: number;
  days: Array<{ dayNumber: number; name: string }>;
}): string {
  return [
    "🏋️ جدولك الحالي",
    "",
    splitLabels[program.split],
    `${program.trainingDaysPerWeek} أيام بالأسبوع`,
    "",
    ...program.days.map((day) => `اليوم ${day.dayNumber} — ${day.name}`),
  ].join("\n");
}

export async function handleWorkoutCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }
  if (user.onboardingStep !== OnboardingStep.COMPLETE) {
    await ctx.reply("كمل الإعداد أولاً عن طريق /start وبعدها نكدر ننشئ جدولك.");
    return;
  }
  const program = await getActiveWorkoutProgram(user.id);
  if (!program) {
    const memberships = await getActiveGymMemberships(user.id);
    const keyboard = new InlineKeyboard();
    if (memberships.length > 1) {
      for (const membership of memberships) {
        keyboard.text(
          `إنشاء — ${membership.gym.settings?.displayName ?? membership.gym.name}`,
          `workout:create:${membership.id}`,
        ).row();
      }
    } else {
      keyboard.text("إنشاء جدول التمرين", memberships[0] ? `workout:create:${memberships[0].id}` : "workout:create");
    }
    await ctx.reply("ما عندك جدول تمرين بعد.", {
      reply_markup: keyboard,
    });
    return;
  }
  await ctx.reply(programText(program), { reply_markup: dayKeyboard(program.days) });
}

export async function handleCreateWorkoutCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const user = await currentUser(ctx);
  if (!user || user.onboardingStep !== OnboardingStep.COMPLETE) {
    await ctx.reply("كمل الإعداد أولاً عن طريق /start.");
    return;
  }
  try {
    const data = ctx.callbackQuery?.data;
    const membershipId = data?.split(":")[2];
    const membership = membershipId
      ? (await resolveGymMembership({ userId: user.id, membershipId })).membership
      : null;
    const program = await generateInitialWorkoutProgram(user.id, membership?.gymId);
    await ctx.reply(
      `✅ انبنى جدول تمرينك\n\n${programText(program)}`,
      { reply_markup: dayKeyboard(program.days) },
    );
  } catch (error) {
    if (error instanceof WorkoutProgramError) {
      await ctx.reply(error.code === "GYM_SELECTION_REQUIRED" || error.code === "INVALID_GYM"
        ? "اختيار القاعة غير صالح. ارجع إلى /workout واختار قاعة مصرح بها."
        : "ما كدرنا ننشئ الجدول لأن معلومات التمرين مو مكتملة. راجع /profile.");
      return;
    }
    throw error;
  }
}

function restLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} دقيقة`;
  return `${seconds} ثانية`;
}

export async function handleWorkoutDayCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const data = ctx.callbackQuery?.data;
  const dayId = data?.slice("workout:day:".length);
  const user = await currentUser(ctx);
  if (!user || !dayId) return;
  const day = await getWorkoutDay(user.id, dayId);
  if (!day) {
    await ctx.reply("هذا اليوم مو موجود بجدولك الحالي.");
    return;
  }
  const lines = [day.name, ""];
  day.exercises.forEach((item) => {
    lines.push(
      `${item.order}. ${item.exercise.name}`,
      `${item.sets} × ${item.repMin}-${item.repMax}`,
      `راحة: ${restLabel(item.restSeconds)}`,
      ...(item.rirTarget === null ? [] : [`RIR: ${item.rirTarget}`]),
      "",
    );
  });
  await ctx.reply(lines.join("\n").trim(), {
    reply_markup: new InlineKeyboard().text("▶️ ابدأ التمرين", `workout:start:${day.id}`),
  });
}

export async function handleStartWorkoutCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const data = ctx.callbackQuery?.data;
  const dayId = data?.slice("workout:start:".length);
  const user = await currentUser(ctx);
  if (!user || !dayId) return;
  try {
    const session = await startWorkoutSession(user.id, dayId);
    await ctx.reply(
      [
        `▶️ بدأ تمرين ${session.workoutDay?.name ?? "اليوم"}`,
        "",
        "سجّل كل مجموعة بهذا الشكل:",
        "/logset <رقم التمرين> <رقم المجموعة> <الوزن> <العدات> [RIR]",
        "مثال: /logset 1 1 60 10 2",
      ].join("\n"),
    );
  } catch (error) {
    if (error instanceof WorkoutSessionError) {
      await ctx.reply("عندك تمرين مفتوح حالياً. استخدم /currentworkout أو /finishworkout.");
      return;
    }
    throw error;
  }
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = normalizeNumericText(value);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseWeight(value: string | undefined): number | null | undefined {
  if (!value) return undefined;
  const normalized = normalizeNumericText(value);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function handleLogSetCommand(ctx: Context, raw: string): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const exerciseNumber = parseInteger(parts[0]);
  const setNumber = parseInteger(parts[1]);
  const weightKg = parseWeight(parts[2]);
  const reps = parseInteger(parts[3]);
  const rir = parts[4] === undefined ? null : parseInteger(parts[4]);
  if (exerciseNumber === null || setNumber === null || weightKg === undefined || reps === null || (parts[4] !== undefined && rir === null)) {
    await ctx.reply("الصيغة: /logset <رقم التمرين> <رقم المجموعة> <الوزن> <العدات> [RIR]\nمثال: /logset 1 1 60 10 2");
    return;
  }
  try {
    const result = await logExerciseSet({
      userId: user.id,
      exerciseNumber,
      setNumber,
      weightKg,
      reps,
      rir,
    });
    await ctx.reply([
      "✅ انحفظت المجموعة",
      "",
      result.exercise.name,
      `${weightKg} كغم × ${reps}`,
      ...(rir === null ? [] : [`RIR ${rir}`]),
    ].join("\n"));
  } catch (error) {
    if (error instanceof WorkoutSessionError) {
      await ctx.reply("ما كدرنا نحفظها. تأكد من الأرقام وأن عندك تمرين مفتوح من /workout.");
      return;
    }
    throw error;
  }
}

export async function handleCurrentWorkoutCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const session = await getCurrentWorkoutSession(user.id);
  if (!session) {
    await ctx.reply("ما عندك تمرين مفتوح حالياً. استخدم /workout حتى تبدأ.");
    return;
  }
  const lines = [`🏋️ ${session.workoutDay?.name ?? "التمرين الحالي"}`, ""];
  for (const log of session.exerciseLogs) {
    const working = log.setLogs.filter((set) => !set.isWarmup);
    lines.push(
      `${log.order}. ${log.exercise.name}`,
      working.length
        ? working.map((set) => `${set.weightKg ?? 0} كغم × ${set.reps}${set.rir === null ? "" : ` (RIR ${set.rir})`}`).join(" | ")
        : "ماكو مجموعات مسجلة",
      "",
    );
  }
  await ctx.reply(lines.join("\n").trim());
}

export async function handleFinishWorkoutCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  try {
    const summary = await completeWorkoutSession(user.id);
    const lines = ["✅ خلص تمرينك", ""];
    for (const item of summary.exercises) {
      const working = item.sets.filter((set) => !set.isWarmup);
      lines.push(
        item.exercise.name,
        ...(working.length
          ? [
              `${item.recommendation.currentWeightKg ?? working.at(-1)?.weightKg ?? 0} كغم`,
              working.map((set) => set.reps).join(" / "),
            ]
          : ["ماكو مجموعات مسجلة"]),
        "",
        "التوصية للمرة الجاية:",
        item.recommendation.reason,
        "",
      );
    }
    await ctx.reply(lines.join("\n").trim());
  } catch (error) {
    if (error instanceof WorkoutSessionError) {
      await ctx.reply("ما عندك تمرين مفتوح حتى تنهيه.");
      return;
    }
    throw error;
  }
}
