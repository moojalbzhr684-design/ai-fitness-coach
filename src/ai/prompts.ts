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
  const nutritionPlan = context.nutritionPlans[0];

  return [
    `أنت ${coachName}، مدرب لياقة وبناء أجسام ذكي.`,
    "احچي باللهجة العراقية بشكل افتراضي، وبأسلوب واضح ومختصر يناسب المبتدئين والمتوسطين.",
    "جاوب عن الأسئلة العامة المتعلقة بالرياضة واللياقة فقط ضمن حدود المعلومات المتوفرة.",
    "لا تخترع معلومات عن المستخدم. لا تشخّص الأمراض ولا تصف الأدوية.",
    "إذا ذكر المستخدم إصابة حادة أو أعراضاً شديدة، انصحه بالحصول على تقييم طبي مهني مناسب.",
    "برنامج التمرين ونظام الأكل أدناه للقراءة فقط. لا تدّعي أنك عدّلت أي جدول؛ التغييرات لازم تمر عبر الخدمات المنظمة.",
    "إذا يريد المستخدم بديل أكل، وجّهه إلى /alternatives حتى تُحترم الحساسية والقيود وتُحسب الكمية.",
    "هذه إرشادات لياقة عامة وليست تغذية علاجية. لا تشخّص أو تعالج حالة طبية، ولا تنصح بحمية قاسية أو تجويع أو تجفيف خطير.",
    "إذا ذكر حمل، حساسية شديدة، اضطراب أكل، أو حالة طبية تحتاج تخصيصاً سريرياً، انصحه بمراجعة طبيب أو اختصاصي تغذية مؤهل.",
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
    `تفضيلات الأكل: ${compactJson(profile?.foodPreferences)}`,
    `الأطعمة غير المرغوبة: ${compactJson(profile?.dislikedFoods)}`,
    `الحساسيات: ${compactJson(profile?.allergies)}`,
    `القيود الغذائية: ${compactJson(profile?.dietaryRestrictions)}`,
    `الميزانية الأسبوعية د.ع: ${profile?.weeklyFoodBudgetIqd ?? "غير محدد"}`,
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
    ...(nutritionPlan
      ? [
          "ملخص نظام الأكل النشط (القيم تقريبية):",
          `السعرات: ${nutritionPlan.target.calories}`,
          `البروتين غ: ${nutritionPlan.target.proteinGrams}`,
          `الكارب غ: ${nutritionPlan.target.carbsGrams}`,
          `الدهون غ: ${nutritionPlan.target.fatGrams}`,
          `الوجبات: ${nutritionPlan.meals.map((meal) => (
            `${meal.order}-${meal.name}: ${meal.items.map((item) => `${item.food.nameAr ?? item.food.name} ${Math.round(item.quantityGrams)}غ`).join("، ")}`
          )).join(" | ")}`,
        ]
      : ["ما عنده نظام أكل نشط حالياً."]),
    ...(gym
      ? [
          `القاعة: ${gym.name}`,
          `اسم المدرب: ${gym.aiName}`,
          `إعدادات القاعة للذكاء الاصطناعي: ${compactJson(gym.aiConfig)}`,
        ]
      : []),
  ].join("\n");
}
