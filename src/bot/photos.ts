import { InlineKeyboard, type Context } from "grammy";
import { OnboardingStep, PhotoAnalysisStatus, PhotoView } from "../generated/prisma/client.js";
import { MediaStorageError } from "../media/storage.js";
import { TelegramMediaStorage } from "../media/telegram-storage.js";
import { analyzeProgressPhotoSet, VisionAnalysisError } from "../services/photo-analysis.js";
import {
  addTelegramProgressPhoto,
  deleteLatestProgressPhotoSet,
  getDraftProgressPhotoSet,
  getLatestProgressPhotoSet,
  getOrCreateProgressPhotoSet,
  getPhotoProgressSummary,
  nextMissingPhotoView,
  ProgressPhotoError,
  setPhotoPrivacyPreferences,
} from "../services/progress-photos.js";
import { findUserByTelegramId } from "../services/users.js";
import { getActiveGymMemberships, resolveGymMembership } from "../auth/gym-scope.js";

const viewLabels: Record<PhotoView, string> = {
  [PhotoView.FRONT]: "الأمامية FRONT",
  [PhotoView.SIDE]: "الجانبية SIDE",
  [PhotoView.BACK]: "الخلفية BACK",
  [PhotoView.OTHER]: "الأخرى",
};

const statusLabels: Record<PhotoAnalysisStatus, string> = {
  [PhotoAnalysisStatus.PENDING]: "قيد التحليل",
  [PhotoAnalysisStatus.COMPLETED]: "مكتمل",
  [PhotoAnalysisStatus.FAILED]: "فشل",
  [PhotoAnalysisStatus.SKIPPED]: "محفوظ بدون تحليل",
};

async function currentUser(ctx: Context) {
  if (!ctx.from) return null;
  return findUserByTelegramId(BigInt(ctx.from.id));
}

async function sendViewPrompt(ctx: Context, view: PhotoView | null): Promise<void> {
  if (!view) return;
  const order = view === PhotoView.FRONT ? "1 من 3" : view === PhotoView.SIDE ? "2 من 3" : "3 من 3";
  await ctx.reply(`📷 أرسل صورة ${viewLabels[view]} (${order}) كصورة Telegram.`);
}

export async function handlePhotosCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }
  if (user.onboardingStep !== OnboardingStep.COMPLETE) {
    await ctx.reply("كمل الإعداد أولاً عن طريق /start وبعدها تكدر ترفع صور التقدم.");
    return;
  }
  const draft = await getDraftProgressPhotoSet(user.id);
  if (draft) {
    await ctx.reply("نكمل رفع صور التقدم من المكان اللي وقفنا بيه.");
    await sendViewPrompt(ctx, nextMissingPhotoView(draft.photos.map((photo) => photo.view)));
    return;
  }
  const memberships = await getActiveGymMemberships(user.id);
  if (memberships.length > 1) {
    const keyboard = new InlineKeyboard();
    for (const membership of memberships) {
      keyboard.text(membership.gym.settings?.displayName ?? membership.gym.name, `photos:gym:${membership.id}`).row();
    }
    await ctx.reply("اختار القاعة المرتبطة بمجموعة الصور:", { reply_markup: keyboard });
    return;
  }
  await sendConsentPrompt(ctx, memberships[0]?.id);
}

async function sendConsentPrompt(ctx: Context, membershipId?: string): Promise<void> {
  const suffix = membershipId ? `:${membershipId}` : "";
  await ctx.reply([
    "📸 رفع صور التقدم",
    "",
    "راح نستخدم الصور حتى نتابع التغييرات مع الوقت.",
    "التحليل مو تشخيص طبي وما راح يعطي نسبة دهون دقيقة.",
    "",
    "كل الصور تبقى خاصة افتراضياً، ووصول المدرب أو القاعة ما يصير تلقائياً.",
  ].join("\n"), {
    reply_markup: new InlineKeyboard()
      .text("أوافق على تحليل الصور", `photos:consent:analyze${suffix}`)
      .row()
      .text("رفع بدون تحليل", `photos:consent:store${suffix}`)
      .text("إلغاء", `photos:consent:cancel${suffix}`),
  });
}

export async function handlePhotoGymCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const user = await currentUser(ctx);
  const membershipId = ctx.callbackQuery?.data?.split(":")[2];
  if (!user || !membershipId) return;
  await resolveGymMembership({ userId: user.id, membershipId });
  await sendConsentPrompt(ctx, membershipId);
}

export async function handlePhotoConsentCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const user = await currentUser(ctx);
  const data = ctx.callbackQuery?.data;
  if (!user || !data) return;
  if (user.onboardingStep !== OnboardingStep.COMPLETE) {
    await ctx.reply("كمل الإعداد أولاً عن طريق /start.");
    return;
  }
  const choice = data.split(":")[2];
  const membershipId = data.split(":")[3];
  if (choice === "cancel") {
    await ctx.reply("تم إلغاء رفع الصور.");
    return;
  }
  const analysisRequested = choice === "analyze";
  if (analysisRequested) {
    await setPhotoPrivacyPreferences(user.id, { allowVisionAnalysis: true });
  }
  try {
    const membership = membershipId
      ? (await resolveGymMembership({ userId: user.id, membershipId })).membership
      : null;
    const result = await getOrCreateProgressPhotoSet(user.id, analysisRequested, membership?.gymId);
    await ctx.reply(
      result.resumed
        ? "نكمل مجموعة الصور المفتوحة."
        : analysisRequested
          ? "تم تسجيل موافقتك على تحليل هذه المجموعة. الصور تبقى خاصة."
          : "راح نحفظ هذه المجموعة بدون تحليل. الصور تبقى خاصة.",
    );
    await sendViewPrompt(
      ctx,
      nextMissingPhotoView(result.photoSet.photos.map((photo) => photo.view)),
    );
  } catch (error) {
    if (error instanceof ProgressPhotoError) {
      await ctx.reply("ما كدرنا نبدأ رفع الصور. تأكد أن إعداد ملفك مكتمل.");
      return;
    }
    throw error;
  }
}

export async function handleProgressPhotoMessage(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user || !ctx.message?.photo) return;
  const draft = await getDraftProgressPhotoSet(user.id);
  if (!draft) {
    await ctx.reply("استخدم /photos بالبداية حتى تفتح مجموعة صور تقدم خاصة.");
    return;
  }
  const photo = ctx.message.photo.at(-1);
  if (!photo?.file_id) {
    await ctx.reply("ما كدرنا نقرأ ملف الصورة. جرّب ترسلها كصورة مرة ثانية.");
    return;
  }
  const storage = new TelegramMediaStorage(ctx.api);
  try {
    const result = await addTelegramProgressPhoto({
      userId: user.id,
      photoSetId: draft.id,
      storage,
      input: {
        fileId: photo.file_id,
        fileUniqueId: photo.file_unique_id,
        ...(photo.file_size !== undefined ? { fileSize: photo.file_size } : {}),
        width: photo.width,
        height: photo.height,
        mimeType: "image/jpeg",
      },
    });
    await ctx.reply(`✅ انحفظت الصورة ${viewLabels[result.view]} بصورة خاصة.`);
    if (!result.complete) {
      await sendViewPrompt(ctx, result.nextView);
      return;
    }
    await ctx.reply("✅ اكتملت صور التقدم.");
    if (!result.shouldAnalyze) {
      await ctx.reply("تم حفظ الصور بدون تحليل.");
      return;
    }
    await ctx.reply("جارٍ تحليل الصور...");
    try {
      const analysis = await analyzeProgressPhotoSet({
        photoSetId: draft.id,
        storage,
      });
      await ctx.reply([
        "📊 اكتمل تحليل الصور",
        "",
        analysis.overallSummary ?? "اكتمل التحليل بدون ملخص قابل للعرض.",
        ...(analysis.comparisonSummary ? ["", `المقارنة: ${analysis.comparisonSummary}`] : []),
        "",
        "الملاحظات تقريبية وليست تشخيصاً طبياً أو تقديراً دقيقاً لنسبة الدهون.",
      ].join("\n"));
    } catch (error) {
      if (error instanceof VisionAnalysisError) {
        await ctx.reply("انحفظت الصور، بس تعذر التحليل حالياً. تكدر تراجعها لاحقاً من /latestphotos.");
        return;
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof MediaStorageError) {
      await ctx.reply(
        error.code === "MEDIA_TOO_LARGE"
          ? "حجم الصورة أكبر من الحد المسموح. أرسل نسخة أصغر كصورة Telegram."
          : "ملف الصورة غير صالح. جرّب صورة ثانية.",
      );
      return;
    }
    if (error instanceof ProgressPhotoError) {
      await ctx.reply("مجموعة الصور تغيرت أو اكتملت. استخدم /photos حتى نعرض الحالة الحالية.");
      return;
    }
    throw error;
  }
}

export async function handleUnsupportedPhotoDocument(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) return;
  const draft = await getDraftProgressPhotoSet(user.id);
  if (draft) {
    await ctx.reply("بهذا التدفق نقبل صور Telegram فقط. لا ترسلها كملف أو document.");
  }
}

export async function handleLatestPhotosCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const latest = await getLatestProgressPhotoSet(user.id);
  if (!latest) {
    await ctx.reply("ما عندك صور تقدم بعد. استخدم /photos حتى تبدأ.");
    return;
  }
  const views = latest.photos.map((photo) => viewLabels[photo.view]).join("، ") || "ماكو صور بعد";
  const analysisStatus = latest.analysis?.status ?? PhotoAnalysisStatus.PENDING;
  await ctx.reply([
    "📸 آخر مجموعة صور",
    "",
    `التاريخ: ${latest.capturedAt.toLocaleDateString("ar-IQ")}`,
    `الوزن: ${latest.weightKg ?? "غير مسجل"}${latest.weightKg === null ? "" : " كغم"}`,
    `الخصر: ${latest.waistCm ?? "غير مسجل"}${latest.waistCm === null ? "" : " سم"}`,
    `الزوايا: ${views}`,
    `حالة التحليل: ${statusLabels[analysisStatus]}`,
    ...(latest.analysis?.overallSummary ? ["", `الملخص: ${latest.analysis.overallSummary}`] : []),
    "",
    "الصور الخاصة ما تنرسل تلقائياً.",
  ].join("\n"));
}

export async function handlePhotoProgressCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const progress = await getPhotoProgressSummary(user.id);
  if (!progress.latest) {
    await ctx.reply("ما عندك متابعات صور مكتملة بعد. استخدم /photos.");
    return;
  }
  await ctx.reply([
    "📸 تقدم الصور",
    "",
    "عدد المتابعات:",
    String(progress.count),
    "",
    "آخر تحليل:",
    progress.latest.analysis?.overallSummary ?? "ماكو تحليل مكتمل للمتابعة الأخيرة.",
    "",
    "المقارنة:",
    progress.latest.analysis?.comparisonSummary ?? "ماكو مقارنة سابقة متاحة.",
  ].join("\n"));
}

export async function handleDeletePhotosCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const latest = await getLatestProgressPhotoSet(user.id);
  if (!latest) {
    await ctx.reply("ما عندك مجموعة صور حتى تنحذف.");
    return;
  }
  await ctx.reply("متأكد تريد تحذف آخر مجموعة صور وتحليلها؟ الحذف ما ينرجع.", {
    reply_markup: new InlineKeyboard()
      .text("نعم، احذف آخر مجموعة", `photos:delete:${latest.id}`)
      .row()
      .text("إلغاء", "photos:delete:cancel"),
  });
}

export async function handleDeletePhotosCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery();
  const user = await currentUser(ctx);
  const data = ctx.callbackQuery?.data;
  if (!user || !data) return;
  const confirmedId = data.split(":")[2];
  if (!confirmedId || confirmedId === "cancel") {
    await ctx.reply("تم إلغاء الحذف.");
    return;
  }
  try {
    const result = await deleteLatestProgressPhotoSet({
      userId: user.id,
      confirmedPhotoSetId: confirmedId,
      storage: new TelegramMediaStorage(ctx.api),
    });
    await ctx.reply(`✅ انحذفت آخر مجموعة صور (${result.deletedPhotoCount} صور) وسجلنا عملية الحذف.`);
  } catch (error) {
    if (error instanceof ProgressPhotoError) {
      await ctx.reply("طلب الحذف قديم أو المجموعة تغيرت. استخدم /deletephotos مرة ثانية.");
      return;
    }
    throw error;
  }
}
