import type { Context } from "grammy";
import type {
  ActivityLevel,
  ExperienceLevel,
  Goal,
  TrainingPlace,
} from "../generated/prisma/client.js";
import { getUserProfile } from "../services/users.js";

const goalLabels: Record<Goal, string> = {
  FAT_LOSS: "خسارة دهون",
  MUSCLE_GAIN: "بناء عضل",
  RECOMPOSITION: "إعادة تركيب الجسم",
  STRENGTH: "زيادة القوة",
  GENERAL_FITNESS: "لياقة عامة",
};

const experienceLabels: Record<ExperienceLevel, string> = {
  BEGINNER: "مبتدئ",
  INTERMEDIATE: "متوسط",
};

const activityLabels: Record<ActivityLevel, string> = {
  SEDENTARY: "قليل جداً",
  LIGHT: "خفيف",
  MODERATE: "متوسط",
  HIGH: "عالي",
  VERY_HIGH: "عالي جداً",
};

const placeLabels: Record<TrainingPlace, string> = {
  GYM: "قاعة",
  HOME: "بيت",
  BOTH: "الاثنين",
};

function value<T>(input: T | null | undefined, suffix = ""): string {
  return input === null || input === undefined ? "غير محدد" : `${input}${suffix}`;
}

export async function handleProfileCommand(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const user = await getUserProfile(BigInt(ctx.from.id));

  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }

  const profile = user.profile;
  const gyms = user.gymMemberships.map(({ gym }) => (
    `${gym.settings?.displayName ?? gym.name} (${gym.settings?.aiDisplayName ?? gym.aiName})`
  )).join("، ");
  const goal = profile?.goal as Goal | null | undefined;
  const activityLevel = profile?.activityLevel as ActivityLevel | null | undefined;
  const experienceLevel = profile?.experienceLevel as ExperienceLevel | null | undefined;
  const trainingPlace = profile?.trainingPlace as TrainingPlace | null | undefined;
  const lines = [
    "📋 معلوماتك الرياضية",
    "",
    `العمر: ${value(profile?.age, " سنة")}`,
    `الطول: ${value(profile?.heightCm, " سم")}`,
    `الوزن: ${value(profile?.weightKg, " كغم")}`,
    `الهدف: ${goal ? goalLabels[goal] : "غير محدد"}`,
    `مستوى النشاط: ${activityLevel ? activityLabels[activityLevel] : "غير محدد"}`,
    `مستوى الخبرة: ${experienceLevel ? experienceLabels[experienceLevel] : "غير محدد"}`,
    `أيام التدريب: ${value(profile?.trainingDaysPerWeek, " بالأسبوع")}`,
    `مدة الجلسة: ${value(profile?.sessionMinutes, " دقيقة")}`,
    `مكان التدريب: ${trainingPlace ? placeLabels[trainingPlace] : "غير محدد"}`,
    `عدد الوجبات: ${value(profile?.mealsPerDay)}`,
    `الميزانية الأسبوعية: ${value(profile?.weeklyFoodBudgetIqd, " د.ع")}`,
    ...(gyms ? ["", `القاعة: ${gyms}`] : []),
  ];

  await ctx.reply(lines.join("\n"));
}
