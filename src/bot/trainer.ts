import { InlineKeyboard, type Context } from "grammy";
import { ApprovalType, GymRole, MembershipStatus, SystemRole } from "../generated/prisma/client.js";
import { GymScopeError, resolveGymMembership } from "../auth/gym-scope.js";
import { prisma } from "../lib/prisma.js";
import {
  ApprovalServiceError,
  approveRequest,
  getPendingApprovalsForTrainer,
  rejectRequest,
} from "../services/approvals.js";
import { getTrainerMembers } from "../services/trainers.js";
import { findUserByTelegramId } from "../services/users.js";

type TenantAction = "trainer" | "mymembers" | "approvals" | "gym";

async function currentUser(ctx: Context) {
  if (!ctx.from) return null;
  return findUserByTelegramId(BigInt(ctx.from.id));
}

async function selectMembership(
  ctx: Context,
  userId: string,
  action: TenantAction,
  roles: GymRole[],
  membershipId?: string,
) {
  const scope = await resolveGymMembership({
    userId,
    roles,
    ...(membershipId ? { membershipId } : {}),
  });
  if (!scope.selectionRequired) return scope.membership;
  const keyboard = new InlineKeyboard();
  for (const item of scope.memberships) {
    keyboard.text(item.gym.settings?.displayName ?? item.gym.name, `tenant:${action}:${item.id}`).row();
  }
  await ctx.reply("اختار القاعة حتى نعرض البيانات ضمن نطاقها:", { reply_markup: keyboard });
  return null;
}

function memberName(member: { firstName: string | null; telegramUsername: string | null }): string {
  return member.firstName ?? (member.telegramUsername ? `@${member.telegramUsername}` : "مشترك");
}

function calorieDescription(requestedChange: unknown): string {
  if (!requestedChange || typeof requestedChange !== "object" || Array.isArray(requestedChange)) return "تغيير منظم";
  const calories = (requestedChange as { calories?: unknown }).calories;
  const delta = (requestedChange as { delta?: unknown }).delta;
  return typeof calories === "number" && typeof delta === "number"
    ? `${calories - delta} → ${calories} سعرة`
    : "تغيير منظم";
}

async function showTrainer(ctx: Context, userId: string, membershipId?: string) {
  const membership = await selectMembership(ctx, userId, "trainer", [GymRole.TRAINER, GymRole.OWNER], membershipId);
  if (!membership) return;
  const [assignedCount, memberCount, approvals] = await Promise.all([
    prisma.trainerAssignment.count({ where: { gymId: membership.gymId, trainerUserId: userId } }),
    prisma.gymMembership.count({ where: { gymId: membership.gymId, role: GymRole.MEMBER, status: MembershipStatus.ACTIVE } }),
    getPendingApprovalsForTrainer(userId, membership.gymId),
  ]);
  await ctx.reply([
    "🏋️ لوحة الكابتن",
    "",
    `القاعة: ${membership.gym.settings?.displayName ?? membership.gym.name}`,
    `الدور: ${membership.role === GymRole.OWNER ? "مالك" : "مدرب"}`,
    `المشتركين المسؤول عنهم: ${membership.role === GymRole.OWNER ? memberCount : assignedCount}`,
    `طلبات الموافقة: ${approvals.length}`,
  ].join("\n"));
}

async function showMembers(ctx: Context, userId: string, membershipId?: string) {
  const membership = await selectMembership(ctx, userId, "mymembers", [GymRole.TRAINER, GymRole.OWNER], membershipId);
  if (!membership) return;
  const members = membership.role === GymRole.OWNER
    ? await prisma.gymMembership.findMany({
        where: { gymId: membership.gymId, role: GymRole.MEMBER, status: MembershipStatus.ACTIVE },
        include: {
          user: {
            select: {
              firstName: true,
              telegramUsername: true,
              profile: { select: { goal: true, weightKg: true } },
              weeklyCheckIns: { orderBy: { evaluatedAt: "desc" }, take: 1, select: { evaluatedAt: true } },
              agentDecisions: { where: { gymId: membership.gymId }, orderBy: { createdAt: "desc" }, take: 1, select: { reason: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }).then((rows) => rows.map(({ user }) => ({ member: user })))
    : await getTrainerMembers(userId, membership.gymId);
  if (members.length === 0) {
    await ctx.reply("ماكو مشتركين ضمن مسؤوليتك بهالقاعة حالياً.");
    return;
  }
  const lines = members.map(({ member }, index) => {
    const lastCheckIn = member.weeklyCheckIns[0]?.evaluatedAt;
    return [
      `${index + 1}. ${memberName(member)}`,
      `الهدف: ${member.profile?.goal ?? "غير محدد"}`,
      `الوزن الحالي: ${member.profile?.weightKg ?? "غير محدد"}`,
      `آخر متابعة: ${lastCheckIn ? lastCheckIn.toLocaleDateString("ar-IQ") : "غير متوفرة"}`,
      `آخر توصية: ${member.agentDecisions[0]?.reason ?? "غير متوفرة"}`,
    ].join("\n");
  });
  await ctx.reply(["👥 المشتركين", "", ...lines].join("\n\n"));
}

async function showApprovals(ctx: Context, userId: string, membershipId?: string) {
  const membership = await selectMembership(ctx, userId, "approvals", [GymRole.TRAINER, GymRole.OWNER], membershipId);
  if (!membership) return;
  const approvals = await getPendingApprovalsForTrainer(userId, membership.gymId);
  if (approvals.length === 0) {
    await ctx.reply("ماكو طلبات موافقة معلقة بهالقاعة.");
    return;
  }
  for (const [index, request] of approvals.entries()) {
    const keyboard = new InlineKeyboard()
      .text("✅ موافقة", `approval:approve:${request.reference}`)
      .text("❌ رفض", `approval:reject:${request.reference}`);
    await ctx.reply([
      `${index + 1}️⃣ ${memberName(request.member)}`,
      "",
      "التغيير المقترح:",
      request.type === ApprovalType.NUTRITION_ADJUSTMENT ? calorieDescription(request.requestedChange) : "تعديل تمرين منظم",
      "",
      "السبب:",
      request.reason,
      "",
      `المرجع: ${request.reference}`,
    ].join("\n"), { reply_markup: keyboard });
  }
}

async function showGym(ctx: Context, userId: string, membershipId?: string) {
  const membership = await selectMembership(ctx, userId, "gym", [GymRole.OWNER], membershipId);
  if (!membership) return;
  const [members, trainers, pending] = await Promise.all([
    prisma.gymMembership.count({ where: { gymId: membership.gymId, role: GymRole.MEMBER, status: MembershipStatus.ACTIVE } }),
    prisma.gymMembership.count({ where: { gymId: membership.gymId, role: GymRole.TRAINER, status: MembershipStatus.ACTIVE } }),
    prisma.approvalRequest.count({ where: { gymId: membership.gymId, status: "PENDING" } }),
  ]);
  await ctx.reply([
    "🏢 إدارة القاعة",
    "",
    `القاعة: ${membership.gym.settings?.displayName ?? membership.gym.name}`,
    `المشتركين: ${members}`,
    `المدربين: ${trainers}`,
    `طلبات الموافقة: ${pending}`,
    `اسم المدرب الذكي: ${membership.gym.settings?.aiDisplayName ?? membership.gym.aiName}`,
  ].join("\n"));
}

async function runTenantCommand(ctx: Context, action: TenantAction, membershipId?: string) {
  const user = await currentUser(ctx);
  if (!user) {
    await ctx.reply("استخدم /start بالبداية حتى نسوي ملفك.");
    return;
  }
  try {
    if (action === "trainer") await showTrainer(ctx, user.id, membershipId);
    else if (action === "mymembers") await showMembers(ctx, user.id, membershipId);
    else if (action === "approvals") await showApprovals(ctx, user.id, membershipId);
    else await showGym(ctx, user.id, membershipId);
  } catch (error) {
    if (error instanceof GymScopeError || error instanceof ApprovalServiceError) {
      await ctx.reply("هذا الأمر متوفر فقط لمدرب أو مالك ضمن القاعة المصرح بها.");
      return;
    }
    throw error;
  }
}

export async function handleTrainerCommand(ctx: Context) { await runTenantCommand(ctx, "trainer"); }
export async function handleMyMembersCommand(ctx: Context) { await runTenantCommand(ctx, "mymembers"); }
export async function handleApprovalsCommand(ctx: Context) { await runTenantCommand(ctx, "approvals"); }
export async function handleGymCommand(ctx: Context) { await runTenantCommand(ctx, "gym"); }

export async function handleTenantSelectionCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const [, action, membershipId] = data.split(":");
  if (!action || !membershipId || !new Set(["trainer", "mymembers", "approvals", "gym"]).has(action)) return;
  await ctx.answerCallbackQuery();
  await runTenantCommand(ctx, action as TenantAction, membershipId);
}

export async function handleApprovalCallback(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  const data = ctx.callbackQuery?.data;
  if (!user || !data) return;
  const [, action, reference] = data.split(":");
  if (!reference || (action !== "approve" && action !== "reject")) return;
  const request = await prisma.approvalRequest.findUnique({ where: { reference }, select: { id: true } });
  if (!request) {
    await ctx.answerCallbackQuery({ text: "الطلب غير متوفر" });
    return;
  }
  try {
    if (action === "approve") await approveRequest(user.id, request.id);
    else await rejectRequest(user.id, request.id);
    await ctx.answerCallbackQuery({ text: action === "approve" ? "تمت الموافقة" : "تم الرفض" });
    await ctx.reply(action === "approve" ? "✅ تمت مراجعة الطلب وتطبيق التغيير الآمن إن وجد." : "❌ تم رفض الطلب بدون تعديل الخطة.");
  } catch (error) {
    if (error instanceof ApprovalServiceError) {
      await ctx.answerCallbackQuery({ text: "الطلب منتهي أو تمت مراجعته، أو ما عندك صلاحية." });
      return;
    }
    throw error;
  }
}

export async function handleAdminCommand(ctx: Context): Promise<void> {
  const user = await currentUser(ctx);
  if (!user || user.systemRole !== SystemRole.SUPER_ADMIN) {
    await ctx.reply("هذا الأمر متوفر لمدير المنصة فقط.");
    return;
  }
  const [gyms, users, members, trainers, approvals, aiEvents] = await Promise.all([
    prisma.gym.count(),
    prisma.user.count(),
    prisma.gymMembership.count({ where: { role: GymRole.MEMBER, status: MembershipStatus.ACTIVE } }),
    prisma.gymMembership.count({ where: { role: GymRole.TRAINER, status: MembershipStatus.ACTIVE } }),
    prisma.approvalRequest.count({ where: { status: "PENDING" } }),
    prisma.aIEvent.count(),
  ]);
  await ctx.reply([
    "🛡 إدارة المنصة",
    "",
    `القاعات: ${gyms}`,
    `المستخدمين: ${users}`,
    `عضويات المشتركين: ${members}`,
    `المدربين: ${trainers}`,
    `طلبات الموافقة: ${approvals}`,
    `سجلات الذكاء الاصطناعي: ${aiEvents}`,
  ].join("\n"));
}
