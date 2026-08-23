import type { Context } from "grammy";
import { findUserByTelegramId } from "../services/users.js";
import { joinGymAsMember } from "../services/gyms.js";

export async function handleJoinCommand(ctx: Context, rawCode: string): Promise<void> {
  if (!ctx.from) return;

  const user = await findUserByTelegramId(BigInt(ctx.from.id));
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }

  const code = rawCode.trim();
  if (!code) {
    await ctx.reply("اكتب كود القاعة بعد الأمر. مثال:\n/join DEVGYM");
    return;
  }

  const result = await joinGymAsMember(user.id, code);
  if (!result) {
    await ctx.reply("ما لگيت قاعة فعّالة بهذا الكود. تأكد من الكود وجرّب مرة ثانية.");
    return;
  }

  await ctx.reply(
    `✅ انضمّيت إلى ${result.gym.name}.\nمدرب القاعة الذكي: ${result.gym.aiName}`,
  );
}
