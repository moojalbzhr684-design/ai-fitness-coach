import { Bot } from "grammy";
import { askCoach, CoachUnavailableError } from "../ai/coach.js";
import { env } from "../config/env.js";
import { OnboardingStep } from "../generated/prisma/client.js";
import { findUserByTelegramId, upsertTelegramUser } from "../services/users.js";
import { getEffectiveGymBranding } from "../services/gym-settings.js";
import { safeErrorMessage } from "../utils/text.js";
import { handleJoinCommand } from "./gym.js";
import {
  handleOnboardingCallback,
  handleOnboardingText,
  sendOnboardingPrompt,
} from "./onboarding.js";
import { handleProfileCommand } from "./profile.js";
import {
  handleCheckInCallback,
  handleCheckInCommand,
  handleCheckInGymCallback,
  handleCheckInDraftText,
  handleCheckInStatusCommand,
  handleProgressCommand,
  handleSkipCommand,
  handleWeightCommand,
} from "./checkin.js";
import {
  handleAlternativesCommand,
  handleCreateNutritionCallback,
  handleFoodCommand,
  handleMacrosCommand,
} from "./nutrition.js";
import {
  handleCreateWorkoutCallback,
  handleCurrentWorkoutCommand,
  handleFinishWorkoutCommand,
  handleLogSetCommand,
  handleStartWorkoutCallback,
  handleWorkoutCommand,
  handleWorkoutDayCallback,
} from "./workout.js";
import {
  handleDeletePhotosCallback,
  handleDeletePhotosCommand,
  handleLatestPhotosCommand,
  handlePhotoGymCallback,
  handlePhotoConsentCallback,
  handlePhotoProgressCommand,
  handlePhotosCommand,
  handleProgressPhotoMessage,
  handleUnsupportedPhotoDocument,
} from "./photos.js";
import {
  handleAdminCommand,
  handleApprovalCallback,
  handleApprovalsCommand,
  handleGymCommand,
  handleMyMembersCommand,
  handleTenantSelectionCallback,
  handleTrainerCommand,
} from "./trainer.js";

export function createTelegramBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const wasExisting = await findUserByTelegramId(BigInt(from.id));
    const user = await upsertTelegramUser(
      {
        telegramId: BigInt(from.id),
        ...(from.username ? { username: from.username } : {}),
        ...(from.first_name ? { firstName: from.first_name } : {}),
        ...(from.last_name ? { lastName: from.last_name } : {}),
      },
      env.SUPER_ADMIN_TELEGRAM_ID,
    );

    if (user.onboardingStep === OnboardingStep.COMPLETE) {
      const branding = await getEffectiveGymBranding(user.id);
      const brandLines = branding.branding
        ? [
            ``,
            `🏋️ ${branding.branding.displayName}`,
            `مدربك: ${branding.branding.aiDisplayName}`,
            ...(branding.branding.welcomeMessage ? [branding.branding.welcomeMessage] : []),
          ]
        : [];
      await ctx.reply(
        ["هلا بيك من جديد 👋", "ملفك الرياضي جاهز. استخدم /profile أو /join، أو اسألني سؤال عام عن اللياقة.", ...brandLines].join("\n"),
      );
      return;
    }

    await sendOnboardingPrompt(ctx, user.onboardingStep, !wasExisting);
  });

  bot.command("profile", handleProfileCommand);
  bot.command("join", async (ctx) => handleJoinCommand(ctx, ctx.match));
  bot.command("workout", handleWorkoutCommand);
  bot.command("currentworkout", handleCurrentWorkoutCommand);
  bot.command("logset", async (ctx) => handleLogSetCommand(ctx, ctx.match));
  bot.command("finishworkout", handleFinishWorkoutCommand);
  bot.command("food", handleFoodCommand);
  bot.command("macros", handleMacrosCommand);
  bot.command("alternatives", async (ctx) => handleAlternativesCommand(ctx, ctx.match));
  bot.command("checkin", handleCheckInCommand);
  bot.command("checkinstatus", handleCheckInStatusCommand);
  bot.command("progress", handleProgressCommand);
  bot.command("weight", async (ctx) => handleWeightCommand(ctx, ctx.match));
  bot.command("skip", handleSkipCommand);
  bot.command("photos", handlePhotosCommand);
  bot.command("latestphotos", handleLatestPhotosCommand);
  bot.command("photoprogress", handlePhotoProgressCommand);
  bot.command("deletephotos", handleDeletePhotosCommand);
  bot.command("trainer", handleTrainerCommand);
  bot.command("mymembers", handleMyMembersCommand);
  bot.command("approvals", handleApprovalsCommand);
  bot.command("gym", handleGymCommand);
  bot.command("admin", handleAdminCommand);
  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "الأوامر المتوفرة:",
        "/start - بدء أو متابعة الإعداد",
        "/profile - عرض معلوماتك",
        "/join CODE - الانضمام إلى قاعة",
        "/workout - عرض أو إنشاء جدول التمرين",
        "/currentworkout - عرض التمرين المفتوح",
        "/logset - تسجيل مجموعة",
        "/finishworkout - إنهاء التمرين",
        "/food - عرض أو إنشاء نظام الأكل",
        "/macros - عرض أهداف السعرات والماكروز",
        "/alternatives - بدائل الأكل بالكميات المناسبة",
        "/checkin - المتابعة الأسبوعية",
        "/checkinstatus - حالة آخر متابعة",
        "/progress - ملخص تقدمك",
        "/weight - تسجيل وزن سريع",
        "/photos - رفع صور تقدم خاصة",
        "/latestphotos - معلومات آخر مجموعة صور",
        "/photoprogress - ملخص تقدم الصور",
        "/deletephotos - حذف آخر مجموعة بعد التأكيد",
        "/trainer - لوحة الكابتن",
        "/mymembers - المشتركين المسؤول عنهم",
        "/approvals - طلبات الموافقة",
        "/gym - ملخص إدارة القاعة",
        "/admin - ملخص مدير المنصة",
        "/help - المساعدة",
        "",
        "بعد ما تكمل الإعداد، تكدر تسألني أسئلة عامة عن الرياضة واللياقة.",
      ].join("\n"),
    );
  });

  bot.callbackQuery(/^onboarding:/, handleOnboardingCallback);
  bot.callbackQuery(/^workout:create(?::|$)/, handleCreateWorkoutCallback);
  bot.callbackQuery(/^workout:day:/, handleWorkoutDayCallback);
  bot.callbackQuery(/^workout:start:/, handleStartWorkoutCallback);
  bot.callbackQuery(/^nutrition:create(?::|$)/, handleCreateNutritionCallback);
  bot.callbackQuery(/^checkin:gym:/, handleCheckInGymCallback);
  bot.callbackQuery(/^checkin:(?!gym:)/, handleCheckInCallback);
  bot.callbackQuery(/^photos:consent:/, handlePhotoConsentCallback);
  bot.callbackQuery(/^photos:gym:/, handlePhotoGymCallback);
  bot.callbackQuery(/^photos:delete:/, handleDeletePhotosCallback);
  bot.callbackQuery(/^tenant:/, handleTenantSelectionCallback);
  bot.callbackQuery(/^approval:/, handleApprovalCallback);

  bot.on("message:photo", handleProgressPhotoMessage);
  bot.on("message:document", handleUnsupportedPhotoDocument);

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      await ctx.reply("هذا الأمر مو معروف. استخدم /help حتى تشوف الأوامر المتوفرة.");
      return;
    }

    const user = await findUserByTelegramId(BigInt(ctx.from.id));
    if (!user) {
      await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
      return;
    }

    if (user.onboardingStep !== OnboardingStep.COMPLETE) {
      await handleOnboardingText(ctx, user, text);
      return;
    }

    if (await handleCheckInDraftText(ctx, user.id, text)) return;

    try {
      await ctx.replyWithChatAction("typing");
      const answer = await askCoach(user.id, text);
      await ctx.reply(answer);
    } catch (error) {
      if (!(error instanceof CoachUnavailableError)) {
        console.error(
          "Coach handler failed:",
          safeErrorMessage(error, [env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]),
        );
      }
      await ctx.reply("صار خلل مؤقت ويا المدرب الذكي. جرّب مرة ثانية بعد شوية.");
    }
  });

  bot.catch(async (error) => {
    console.error(
      "Telegram update failed:",
      safeErrorMessage(error.error, [env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]),
    );

    try {
      await error.ctx.reply("صار خطأ غير متوقع. جرّب مرة ثانية بعد شوية.");
    } catch {
      // The original Telegram request may have failed, so a follow-up reply is not always possible.
    }
  });

  return bot;
}
