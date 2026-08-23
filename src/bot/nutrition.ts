import { InlineKeyboard, type Context } from "grammy";
import { OnboardingStep } from "../generated/prisma/client.js";
import { getMealItemAlternatives } from "../services/foods.js";
import {
  generateInitialNutritionPlan,
  getActiveNutritionPlan,
  getNutritionTargets,
  NutritionPlanError,
} from "../services/nutrition-plans.js";
import { findUserByTelegramId } from "../services/users.js";
import { normalizeNumericText } from "../utils/text.js";
import { getActiveGymMemberships, resolveGymMembership } from "../auth/gym-scope.js";

async function currentUser(ctx: Context) {
  if (!ctx.from) return null;
  return findUserByTelegramId(BigInt(ctx.from.id));
}

function displayName(food: { name: string; nameAr: string | null }): string {
  return food.nameAr ?? food.name;
}

function nutritionPlanMessages(plan: NonNullable<Awaited<ReturnType<typeof getActiveNutritionPlan>>>): string[] {
  const header = [
    "🍽 نظامك الغذائي",
    "",
    `🔥 السعرات: ${plan.target.calories} kcal`,
    `🥩 البروتين: ${Math.round(plan.target.proteinGrams)}g`,
    `🍚 الكارب: ${Math.round(plan.target.carbsGrams)}g`,
    `🥑 الدهون: ${Math.round(plan.target.fatGrams)}g`,
    "",
    "القيم تقريبية وقد تختلف حسب المنتج وطريقة التحضير.",
  ].join("\n");
  const sections = plan.meals.map((meal) => {
    const calories = Math.round(meal.items.reduce((sum, item) => sum + item.calories, 0));
    const protein = Math.round(meal.items.reduce((sum, item) => sum + item.proteinGrams, 0));
    return [
      "━━━━━━━━━━",
      `${meal.order}. ${meal.name}`,
      "",
      ...meal.items.map((item) => (
        `${item.order}. ${Math.round(item.quantityGrams)}غ ${displayName(item.food)}`
      )),
      "",
      `السعرات: ${calories} kcal`,
      `البروتين: ${protein}g`,
    ].join("\n");
  });
  const messages: string[] = [];
  let current = header;
  for (const section of sections) {
    if (`${current}\n\n${section}`.length > 3_800) {
      messages.push(current);
      current = section;
    } else {
      current = `${current}\n\n${section}`;
    }
  }
  messages.push(current);
  return messages;
}

export async function handleFoodCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }
  if (user.onboardingStep !== OnboardingStep.COMPLETE) {
    await ctx.reply("كمل الإعداد أولاً عن طريق /start وبعدها نكدر ننشئ نظام الأكل.");
    return;
  }
  const plan = await getActiveNutritionPlan(user.id);
  if (!plan) {
    const memberships = await getActiveGymMemberships(user.id);
    const keyboard = new InlineKeyboard();
    if (memberships.length > 1) {
      for (const membership of memberships) {
        keyboard.text(
          `إنشاء — ${membership.gym.settings?.displayName ?? membership.gym.name}`,
          `nutrition:create:${membership.id}`,
        ).row();
      }
    } else {
      keyboard.text("إنشاء نظام الأكل", memberships[0] ? `nutrition:create:${memberships[0].id}` : "nutrition:create");
    }
    await ctx.reply("🍽 ما عندك نظام أكل بعد.", {
      reply_markup: keyboard,
    });
    return;
  }
  for (const message of nutritionPlanMessages(plan)) await ctx.reply(message);
}

export async function handleCreateNutritionCallback(ctx: Context): Promise<void> {
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
    const result = await generateInitialNutritionPlan(user.id, membership?.gymId);
    await ctx.reply("✅ انبنى نظام أكلك بصورة منظمة وآمنة.");
    for (const message of nutritionPlanMessages(result.plan)) await ctx.reply(message);
    if (result.warnings.length) {
      await ctx.reply("ملاحظة: تقدير الكلفة أعلى من الميزانية المدخلة أو بعض الأسعار غير متوفرة؛ ما قللنا السعرات أو البروتين بشكل غير آمن.");
    }
  } catch (error) {
    if (error instanceof NutritionPlanError) {
      await ctx.reply(
        error.code === "GYM_SELECTION_REQUIRED" || error.code === "INVALID_GYM"
          ? "اختيار القاعة غير صالح. ارجع إلى /food واختار قاعة مصرح بها."
          : error.code === "PROFILE_INCOMPLETE"
          ? "معلومات ملف الأكل مو مكتملة. راجع /profile وكمل الإعداد."
          : "ما كدرنا نبني خطة آمنة ضمن الحساسية والقيود المدخلة. عدّل القيود أو استشر اختصاصي تغذية مناسب.",
      );
      return;
    }
    throw error;
  }
}

export async function handleMacrosCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const target = await getNutritionTargets(user.id);
  if (!target) {
    await ctx.reply("ما عندك أهداف غذائية حالياً. استخدم /food حتى تنشئ نظامك.");
    return;
  }
  await ctx.reply([
    "أهدافك اليومية التقريبية:",
    "",
    `🔥 السعرات: ${target.calories} kcal`,
    `🥩 البروتين: ${Math.round(target.proteinGrams)}g`,
    `🍚 الكارب: ${Math.round(target.carbsGrams)}g`,
    `🥑 الدهون: ${Math.round(target.fatGrams)}g`,
  ].join("\n"));
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = normalizeNumericText(value);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function handleAlternativesCommand(ctx: Context, raw: string): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const mealNumber = parsePositiveInteger(parts[0]);
  const foodNumber = parsePositiveInteger(parts[1]);
  if (mealNumber === null || foodNumber === null) {
    await ctx.reply("الصيغة: /alternatives <رقم الوجبة> <رقم الأكل>\nمثال: /alternatives 2 1");
    return;
  }
  const result = await getMealItemAlternatives(user.id, mealNumber, foodNumber);
  if (!result) {
    await ctx.reply("ما لكيت هذا الأكل بنظامك الحالي. تأكد من أرقام الوجبة والأكل.");
    return;
  }
  if (!result.alternatives.length) {
    await ctx.reply("ماكو بديل مناسب وآمن ضمن حساسيتك وقيودك الحالية.");
    return;
  }
  await ctx.reply([
    `بدائل ${Math.round(result.item.quantityGrams)}غ ${displayName(result.item.food)}:`,
    "",
    ...result.alternatives.map((item, index) => [
      `${index + 1}. ${displayName(item.food)} — ${Math.round(item.quantityGrams)}غ`,
      `تقريباً ${Math.round(item.calories)} kcal / بروتين ${Math.round(item.proteinGrams)}g`,
    ].join("\n")),
    "",
    "الكميات والقيم تقريبية، مو مطابقة غرام بغرام.",
  ].join("\n"));
}
