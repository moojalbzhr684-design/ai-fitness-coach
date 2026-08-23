import { InlineKeyboard, type Context } from "grammy";
import {
  ActivityLevel,
  ExperienceLevel,
  Goal,
  OnboardingStep,
  Sex,
  TrainingPlace,
  type User,
} from "../generated/prisma/client.js";
import {
  findUserByTelegramId,
  saveOnboardingAnswer,
  type OnboardingProfileUpdate,
} from "../services/users.js";
import { normalizeNumericText } from "../utils/text.js";

const COMPLETE_MESSAGE = [
  "✅ كملنا إعداد ملفك الرياضي.",
  "",
  "هسه عندي المعلومات الأساسية حتى أبني خطتك.",
  "",
  "الأوامر المتوفرة حالياً:",
  "",
  "/profile - معلوماتك",
  "/workout - إنشاء أو عرض جدول تمرينك",
  "/join - الانضمام إلى قاعة",
  "/help - المساعدة",
  "",
  "وتكدر تحچي وياي بصورة طبيعية.",
].join("\n");

const choiceSteps = new Set<OnboardingStep>([
  OnboardingStep.SEX,
  OnboardingStep.ACTIVITY,
  OnboardingStep.EXPERIENCE,
  OnboardingStep.GOAL,
  OnboardingStep.TRAINING_PLACE,
]);

const choiceValues = {
  [OnboardingStep.SEX]: new Set<string>(Object.values(Sex)),
  [OnboardingStep.ACTIVITY]: new Set<string>(Object.values(ActivityLevel)),
  [OnboardingStep.EXPERIENCE]: new Set<string>(Object.values(ExperienceLevel)),
  [OnboardingStep.GOAL]: new Set<string>(Object.values(Goal)),
  [OnboardingStep.TRAINING_PLACE]: new Set<string>(Object.values(TrainingPlace)),
};

function callback(step: OnboardingStep, value: string): string {
  return `onboarding:${step}:${value}`;
}

function keyboardFor(step: OnboardingStep): InlineKeyboard | undefined {
  switch (step) {
    case OnboardingStep.SEX:
      return new InlineKeyboard()
        .text("ذكر", callback(step, Sex.MALE))
        .text("أنثى", callback(step, Sex.FEMALE))
        .row()
        .text("أفضل ما أحدد", callback(step, Sex.PREFER_NOT_TO_SAY));
    case OnboardingStep.ACTIVITY:
      return new InlineKeyboard()
        .text("قليل جداً", callback(step, ActivityLevel.SEDENTARY))
        .text("خفيف", callback(step, ActivityLevel.LIGHT))
        .row()
        .text("متوسط", callback(step, ActivityLevel.MODERATE))
        .text("عالي", callback(step, ActivityLevel.HIGH))
        .row()
        .text("عالي جداً", callback(step, ActivityLevel.VERY_HIGH));
    case OnboardingStep.EXPERIENCE:
      return new InlineKeyboard()
        .text("مبتدئ", callback(step, ExperienceLevel.BEGINNER))
        .text("متوسط", callback(step, ExperienceLevel.INTERMEDIATE));
    case OnboardingStep.GOAL:
      return new InlineKeyboard()
        .text("خسارة دهون", callback(step, Goal.FAT_LOSS))
        .text("بناء عضل", callback(step, Goal.MUSCLE_GAIN))
        .row()
        .text("إعادة تركيب الجسم", callback(step, Goal.RECOMPOSITION))
        .row()
        .text("زيادة القوة", callback(step, Goal.STRENGTH))
        .text("لياقة عامة", callback(step, Goal.GENERAL_FITNESS));
    case OnboardingStep.TRAINING_PLACE:
      return new InlineKeyboard()
        .text("قاعة", callback(step, TrainingPlace.GYM))
        .text("بيت", callback(step, TrainingPlace.HOME))
        .text("الاثنين", callback(step, TrainingPlace.BOTH));
    default:
      return undefined;
  }
}

function promptFor(step: OnboardingStep): string {
  switch (step) {
    case OnboardingStep.AGE:
      return "شكد عمرك؟";
    case OnboardingStep.SEX:
      return "شنو جنسك؟";
    case OnboardingStep.HEIGHT:
      return "شكد طولك بالسنتيمتر؟ مثال: 175";
    case OnboardingStep.WEIGHT:
      return "شكد وزنك بالكيلوغرام؟ مثال: 78.5";
    case OnboardingStep.ACTIVITY:
      return "شلون مستوى نشاطك اليومي؟";
    case OnboardingStep.EXPERIENCE:
      return "شنو مستوى خبرتك بالتمرين؟";
    case OnboardingStep.GOAL:
      return "شنو هدفك الرئيسي؟";
    case OnboardingStep.TRAINING_DAYS:
      return "كم يوم بالأسبوع تكدر تتمرن؟ اكتب رقم من 2 إلى 6.";
    case OnboardingStep.SESSION_MINUTES:
      return "شكد تگدر تخصص لكل جلسة؟ اكتب الدقائق من 20 إلى 180.";
    case OnboardingStep.TRAINING_PLACE:
      return "وين راح تتمرن غالباً؟";
    case OnboardingStep.MEALS_PER_DAY:
      return "كم وجبة تفضل باليوم؟ اكتب رقم من 2 إلى 6.";
    case OnboardingStep.WEEKLY_FOOD_BUDGET:
      return "شكد ميزانيتك الأسبوعية للأكل بالدينار العراقي؟ اكتب رقم 0 أو أكثر.";
    case OnboardingStep.COMPLETE:
      return COMPLETE_MESSAGE;
  }
}

export async function sendOnboardingPrompt(
  ctx: Context,
  step: OnboardingStep,
  isFirstStart = false,
): Promise<void> {
  const intro = isFirstStart
    ? "هلا بيك 👋\nأنا مدربك الرياضي الذكي.\n\nراح أسألك كم سؤال حتى أبني ملفك الرياضي.\n\nنبدأ بالعمر:\n"
    : "";
  const keyboard = keyboardFor(step);
  await ctx.reply(`${intro}${promptFor(step)}`, keyboard ? { reply_markup: keyboard } : undefined);
}

interface ParsedAnswer {
  nextStep: OnboardingStep;
  profile: OnboardingProfileUpdate;
}

function integerInRange(raw: string, minimum: number, maximum: number): number | null {
  const normalized = normalizeNumericText(raw);
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function numberInRange(raw: string, minimum: number, maximum: number): number | null {
  const normalized = normalizeNumericText(raw);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function parseTextAnswer(step: OnboardingStep, text: string): ParsedAnswer | null {
  switch (step) {
    case OnboardingStep.AGE: {
      const age = integerInRange(text, 16, 80);
      return age === null ? null : { nextStep: OnboardingStep.SEX, profile: { age } };
    }
    case OnboardingStep.HEIGHT: {
      const heightCm = numberInRange(text, 120, 230);
      return heightCm === null
        ? null
        : { nextStep: OnboardingStep.WEIGHT, profile: { heightCm } };
    }
    case OnboardingStep.WEIGHT: {
      const weightKg = numberInRange(text, 35, 300);
      return weightKg === null
        ? null
        : { nextStep: OnboardingStep.ACTIVITY, profile: { weightKg } };
    }
    case OnboardingStep.TRAINING_DAYS: {
      const trainingDaysPerWeek = integerInRange(text, 2, 6);
      return trainingDaysPerWeek === null
        ? null
        : {
            nextStep: OnboardingStep.SESSION_MINUTES,
            profile: { trainingDaysPerWeek },
          };
    }
    case OnboardingStep.SESSION_MINUTES: {
      const sessionMinutes = integerInRange(text, 20, 180);
      return sessionMinutes === null
        ? null
        : { nextStep: OnboardingStep.TRAINING_PLACE, profile: { sessionMinutes } };
    }
    case OnboardingStep.MEALS_PER_DAY: {
      const mealsPerDay = integerInRange(text, 2, 6);
      return mealsPerDay === null
        ? null
        : { nextStep: OnboardingStep.WEEKLY_FOOD_BUDGET, profile: { mealsPerDay } };
    }
    case OnboardingStep.WEEKLY_FOOD_BUDGET: {
      const weeklyFoodBudgetIqd = integerInRange(text, 0, 2_147_483_647);
      return weeklyFoodBudgetIqd === null
        ? null
        : { nextStep: OnboardingStep.COMPLETE, profile: { weeklyFoodBudgetIqd } };
    }
    default:
      return null;
  }
}

function invalidMessage(step: OnboardingStep): string {
  switch (step) {
    case OnboardingStep.AGE:
      return "العمر لازم يكون رقم صحيح من 16 إلى 80. جرّب مرة ثانية.";
    case OnboardingStep.HEIGHT:
      return "الطول لازم يكون بين 120 و230 سم. جرّب مرة ثانية.";
    case OnboardingStep.WEIGHT:
      return "الوزن لازم يكون بين 35 و300 كغم. جرّب مرة ثانية.";
    case OnboardingStep.TRAINING_DAYS:
      return "أيام التدريب لازم تكون رقم من 2 إلى 6. جرّب مرة ثانية.";
    case OnboardingStep.SESSION_MINUTES:
      return "مدة الجلسة لازم تكون من 20 إلى 180 دقيقة. جرّب مرة ثانية.";
    case OnboardingStep.MEALS_PER_DAY:
      return "عدد الوجبات لازم يكون رقم من 2 إلى 6. جرّب مرة ثانية.";
    case OnboardingStep.WEEKLY_FOOD_BUDGET:
      return "الميزانية لازم تكون رقم صحيح 0 أو أكثر. جرّب مرة ثانية.";
    default:
      return "اختار واحد من الأزرار حتى نكمل.";
  }
}

export async function handleOnboardingText(
  ctx: Context,
  user: Pick<User, "id" | "onboardingStep">,
  text: string,
): Promise<void> {
  if (choiceSteps.has(user.onboardingStep)) {
    const keyboard = keyboardFor(user.onboardingStep);
    await ctx.reply(
      invalidMessage(user.onboardingStep),
      keyboard ? { reply_markup: keyboard } : undefined,
    );
    return;
  }

  const parsed = parseTextAnswer(user.onboardingStep, text);
  if (!parsed) {
    await ctx.reply(invalidMessage(user.onboardingStep));
    return;
  }

  const saved = await saveOnboardingAnswer({
    userId: user.id,
    expectedStep: user.onboardingStep,
    nextStep: parsed.nextStep,
    profile: parsed.profile,
  });

  if (!saved) {
    const freshUser = ctx.from
      ? await findUserByTelegramId(BigInt(ctx.from.id))
      : null;
    if (freshUser) await sendOnboardingPrompt(ctx, freshUser.onboardingStep);
    return;
  }

  await sendOnboardingPrompt(ctx, parsed.nextStep);
}

function profileUpdateForChoice(
  step: OnboardingStep,
  value: string,
): { nextStep: OnboardingStep; profile: OnboardingProfileUpdate } | null {
  switch (step) {
    case OnboardingStep.SEX:
      return { nextStep: OnboardingStep.HEIGHT, profile: { sex: value as Sex } };
    case OnboardingStep.ACTIVITY:
      return {
        nextStep: OnboardingStep.EXPERIENCE,
        profile: { activityLevel: value as ActivityLevel },
      };
    case OnboardingStep.EXPERIENCE:
      return {
        nextStep: OnboardingStep.GOAL,
        profile: { experienceLevel: value as ExperienceLevel },
      };
    case OnboardingStep.GOAL:
      return { nextStep: OnboardingStep.TRAINING_DAYS, profile: { goal: value as Goal } };
    case OnboardingStep.TRAINING_PLACE:
      return {
        nextStep: OnboardingStep.MEALS_PER_DAY,
        profile: { trainingPlace: value as TrainingPlace },
      };
    default:
      return null;
  }
}

export async function handleOnboardingCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const data = ctx.callbackQuery?.data;
  if (!data || !ctx.from) return;

  const [, rawStep, value] = data.split(":");
  if (!rawStep || !value || !Object.values(OnboardingStep).includes(rawStep as OnboardingStep)) {
    await ctx.reply("هذا الاختيار غير صالح. استخدم /start حتى نكمل.");
    return;
  }

  const step = rawStep as OnboardingStep;
  const allowedValues = choiceValues[step as keyof typeof choiceValues];
  if (!allowedValues?.has(value)) {
    await ctx.reply("هذا الاختيار غير صالح. جرّب مرة ثانية.");
    return;
  }

  const user = await findUserByTelegramId(BigInt(ctx.from.id));
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }

  if (user.onboardingStep !== step) {
    await ctx.reply("هذا اختيار من خطوة سابقة. نكمل من السؤال الحالي:");
    await sendOnboardingPrompt(ctx, user.onboardingStep);
    return;
  }

  const answer = profileUpdateForChoice(step, value);
  if (!answer) return;

  const saved = await saveOnboardingAnswer({
    userId: user.id,
    expectedStep: step,
    nextStep: answer.nextStep,
    profile: answer.profile,
  });

  if (!saved) {
    const freshUser = await findUserByTelegramId(BigInt(ctx.from.id));
    if (freshUser) await sendOnboardingPrompt(ctx, freshUser.onboardingStep);
    return;
  }

  await sendOnboardingPrompt(ctx, answer.nextStep);
}
