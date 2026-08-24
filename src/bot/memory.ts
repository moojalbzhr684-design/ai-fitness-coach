import type { Context } from "grammy";
import { getActiveGymMemberships } from "../auth/gym-scope.js";
import { AgentMemoryCategory } from "../generated/prisma/client.js";
import { forgetOptionalMemory, getSafeMemorySummary } from "../services/agent-memory.js";
import { getMemberTrainer } from "../services/trainers.js";
import { findUserByTelegramId } from "../services/users.js";
import { normalizeNumericText } from "../utils/text.js";

const categoryLabels: Record<AgentMemoryCategory, string> = {
  [AgentMemoryCategory.FOOD_PREFERENCE]: "تفضيل بالأكل",
  [AgentMemoryCategory.FOOD_DISLIKE]: "أكل ما تحبه",
  [AgentMemoryCategory.TRAINING_PREFERENCE]: "تفضيل بالتمرين",
  [AgentMemoryCategory.SCHEDULE_PREFERENCE]: "موعد مفضل",
  [AgentMemoryCategory.EXERCISE_PREFERENCE]: "تفضيل تمرين",
  [AgentMemoryCategory.COACHING_PREFERENCE]: "أسلوب تدريب مفضل",
  [AgentMemoryCategory.USER_STATED_CONSTRAINT]: "قيد ذكرته",
};

async function memoryContext(ctx: Context) {
  if (!ctx.from) return null;
  const user = await findUserByTelegramId(BigInt(ctx.from.id));
  if (!user) return null;
  const memberships = await getActiveGymMemberships(user.id);
  const gymId = memberships.length === 1 ? memberships[0]!.gymId : undefined;
  const [summary, trainer] = await Promise.all([
    getSafeMemorySummary(user.id, gymId),
    gymId ? getMemberTrainer(user.id, gymId) : Promise.resolve(null),
  ]);
  return { user, summary, trainer };
}
export async function handleMemoryCommand(ctx: Context) {
  const data = await memoryContext(ctx);
  if (!data) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const lines = ["🧠 الأشياء اللي أتذكرها عنك", ""];
  for (const food of data.summary.dislikedFoods) lines.push(`• ما تحب ${food}`);
  for (const food of data.summary.foodPreferences) lines.push(`• تفضل ${food}`);
  for (const memory of data.summary.memories) lines.push(`• ${categoryLabels[memory.category]}: ${memory.value}`);
  if (data.trainer) {
    lines.push(`• مدربك في القاعة: ${data.trainer.trainer.trainerProfile?.displayName ?? data.trainer.trainer.firstName ?? "المدرب"}`);
  }
  if (lines.length === 2) lines.push("ماكو تفضيلات اختيارية محفوظة حالياً.");
  lines.push("", "استخدم /forget حتى تشوف الذكريات الاختيارية اللي تكدر تمسحها.");
  await ctx.reply(lines.join("\n"));
}

export async function handleForgetCommand(ctx: Context, raw: string) {
  const data = await memoryContext(ctx);
  if (!data) {
    await ctx.reply("استخدم /start بالبداية.");
    return;
  }
  const optional = data.summary.memories;
  const normalized = normalizeNumericText(raw.trim());
  if (!normalized) {
    if (!optional.length) {
      await ctx.reply("ماكو ذكريات اختيارية قابلة للحذف. سجل التمارين والقياسات والسجلات التشغيلية ما تنحذف من /forget.");
      return;
    }
    await ctx.reply([
      "اختار رقم الذكرى الاختيارية:",
      "",
      ...optional.map((memory, index) => `${index + 1}. ${categoryLabels[memory.category]}: ${memory.value}`),
      "",
      "مثال: /forget 1",
      "هذا الأمر ما يحذف التمارين أو القياسات أو سجلات النظام.",
    ].join("\n"));
    return;
  }
  if (!/^\d+$/.test(normalized)) {
    await ctx.reply("اكتب رقم الذكرى مثل: /forget 1");
    return;
  }
  const memory = optional[Number(normalized) - 1];
  if (!memory) {
    await ctx.reply("هذا الرقم مو موجود. استخدم /forget حتى تشوف القائمة الحالية.");
    return;
  }
  await forgetOptionalMemory(data.user.id, memory.id);
  await ctx.reply("✅ نسيت هذي المعلومة الاختيارية. السجلات التشغيلية والتاريخ الرياضي ما تغيرت.");
}
