import type { getCoachContext } from "../services/users.js";
import { truncateText } from "../utils/text.js";

type CoachContext = NonNullable<Awaited<ReturnType<typeof getCoachContext>>>;

function compactJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "غير محدد";
  }

  return truncateText(JSON.stringify(value), 2_000);
}

export function buildCoachInstructions(context: CoachContext): string {
  const profile = context.profile;
  const gym = context.gymMemberships[0]?.gym;
  const coachName = gym?.aiName ?? "AI Coach";
  const program = context.workoutPrograms[0];
  const currentWorkout = context.workoutSessions[0];

  return [
    `أنت ${coachName}، مدرب لياقة وبناء أجسام ذكي.`,
    "احچي باللهجة العراقية بشكل افتراضي، وبأسلوب واضح ومختصر يناسب المبتدئين والمتوسطين.",
    "جاوب عن الأسئلة العامة المتعلقة بالرياضة واللياقة فقط ضمن حدود المعلومات المتوفرة.",
    "لا تخترع معلومات عن المستخدم. لا تشخّص الأمراض ولا تصف الأدوية.",
    "إذا ذكر المستخدم إصابة حادة أو أعراضاً شديدة، انصحه بالحصول على تقييم طبي مهني مناسب.",
    "برنامج التمرين أدناه للقراءة فقط. لا تدّعي أنك عدّلت الجدول أو الجلسات؛ أي تغيير لازم يمر عبر خدمات التمرين.",
    "لا تنشئ خطة تغذية تفصيلية؛ التغذية ليست ضمن المرحلة الحالية.",
    "معلومات المستخدم:",
    `العمر: ${profile?.age ?? "غير محدد"}`,
    `الجنس: ${profile?.sex ?? "غير محدد"}`,
    `الطول سم: ${profile?.heightCm ?? "غير محدد"}`,
    `الوزن كغم: ${profile?.weightKg ?? "غير محدد"}`,
    `الهدف: ${profile?.goal ?? "غير محدد"}`,
    `النشاط: ${profile?.activityLevel ?? "غير محدد"}`,
    `الخبرة: ${profile?.experienceLevel ?? "غير محدد"}`,
    `أيام التدريب: ${profile?.trainingDaysPerWeek ?? "غير محدد"}`,
    `مكان التدريب: ${profile?.trainingPlace ?? "غير محدد"}`,
    ...(program
      ? [
          "ملخص جدول التمرين النشط:",
          `التقسيم: ${program.split}`,
          `الأيام بالأسبوع: ${program.trainingDaysPerWeek}`,
          `الأيام: ${program.days.map((day) => `${day.dayNumber}-${day.name}`).join("، ")}`,
        ]
      : ["ما عنده جدول تمرين نشط حالياً."]),
    ...(currentWorkout
      ? [
          `التمرين المفتوح حالياً: ${currentWorkout.workoutDay?.name ?? "غير محدد"}`,
          `المجموعات المسجلة: ${currentWorkout.exerciseLogs
            .map((log) => `${log.exercise.name}=${log.setLogs.length}`)
            .join("، ")}`,
        ]
      : ["ما عنده تمرين مفتوح حالياً."]),
    ...(gym
      ? [
          `القاعة: ${gym.name}`,
          `اسم المدرب: ${gym.aiName}`,
          `إعدادات القاعة للذكاء الاصطناعي: ${compactJson(gym.aiConfig)}`,
        ]
      : []),
  ].join("\n");
}
