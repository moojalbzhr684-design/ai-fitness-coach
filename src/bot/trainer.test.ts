import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  findUserByTelegramId: vi.fn(),
  resolveGymMembership: vi.fn(),
  getTrainerMembers: vi.fn(),
  getPendingApprovalsForTrainer: vi.fn(),
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
  prisma: {
    trainerAssignment: { count: vi.fn() },
    gymMembership: { count: vi.fn(), findMany: vi.fn() },
    approvalRequest: { count: vi.fn(), findUnique: vi.fn() },
    gym: { count: vi.fn() },
    user: { count: vi.fn() },
    aIEvent: { count: vi.fn() },
  },
}));
vi.mock("../services/users.js", () => ({ findUserByTelegramId: mocks.findUserByTelegramId }));
vi.mock("../auth/gym-scope.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../auth/gym-scope.js")>(),
  resolveGymMembership: mocks.resolveGymMembership,
}));
vi.mock("../services/trainers.js", () => ({ getTrainerMembers: mocks.getTrainerMembers }));
vi.mock("../services/approvals.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../services/approvals.js")>(),
  getPendingApprovalsForTrainer: mocks.getPendingApprovalsForTrainer,
  approveRequest: mocks.approveRequest,
  rejectRequest: mocks.rejectRequest,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { GymScopeError } from "../auth/gym-scope.js";
import {
  handleAdminCommand,
  handleApprovalCallback,
  handleApprovalsCommand,
  handleGymCommand,
  handleMyMembersCommand,
  handleTrainerCommand,
} from "./trainer.js";

function context(data?: string) {
  return {
    from: { id: 123 },
    callbackQuery: data ? { data } : undefined,
    reply: vi.fn(),
    answerCallbackQuery: vi.fn(),
  } as never;
}

const membership = {
  id: "membership-a",
  gymId: "gym-a",
  role: GymRole.TRAINER,
  gym: { name: "Gym A", aiName: "Coach A", settings: { displayName: "Power Gym", aiDisplayName: "Power Coach" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUserByTelegramId.mockResolvedValue({ id: "trainer-a", systemRole: SystemRole.USER });
  mocks.resolveGymMembership.mockResolvedValue({ membership, memberships: [membership], selectionRequired: false });
  mocks.getPendingApprovalsForTrainer.mockResolvedValue([]);
});

describe("Telegram trainer and admin foundation", () => {
  it("blocks a member from /trainer", async () => {
    mocks.resolveGymMembership.mockRejectedValue(new GymScopeError("NO_GYM", "No trainer role"));
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleTrainerCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("مدرب أو مالك"));
  });

  it("shows trainer tenant status with scoped counts", async () => {
    mocks.prisma.trainerAssignment.count.mockResolvedValue(3);
    mocks.prisma.gymMembership.count.mockResolvedValue(12);
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleTrainerCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Power Gym"));
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("3"));
  });

  it("shows only the assigned trainer's safe member summaries", async () => {
    mocks.getTrainerMembers.mockResolvedValue([{
      member: {
        firstName: "Ahmed",
        telegramUsername: null,
        profile: { goal: "FAT_LOSS", weightKg: 80 },
        weeklyCheckIns: [{ evaluatedAt: new Date("2026-08-20") }],
        agentDecisions: [{ reason: "Keep current plan" }],
      },
    }]);
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleMyMembersCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Ahmed"));
    expect(mocks.getTrainerMembers).toHaveBeenCalledWith("trainer-a", "gym-a");
  });

  it("lists approvals using opaque references and inline review buttons", async () => {
    mocks.getPendingApprovalsForTrainer.mockResolvedValue([{
      reference: "safe123",
      member: { firstName: "Ahmed", telegramUsername: null },
      type: "NUTRITION_ADJUSTMENT",
      requestedChange: { calories: 2_050, delta: -150 },
      reason: "Trend stable",
    }]);
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleApprovalsCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("safe123"), expect.objectContaining({ reply_markup: expect.anything() }));
  });

  it("revalidates approval callback authorization in the service", async () => {
    mocks.prisma.approvalRequest.findUnique.mockResolvedValue({ id: "request-internal" });
    const ctx = context("approval:approve:safe123") as {
      reply: ReturnType<typeof vi.fn>;
      answerCallbackQuery: ReturnType<typeof vi.fn>;
    };
    await handleApprovalCallback(ctx as never);
    expect(mocks.approveRequest).toHaveBeenCalledWith("trainer-a", "request-internal");
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "تمت الموافقة" });
  });

  it("shows owner gym summary without configuration mutation", async () => {
    mocks.resolveGymMembership.mockResolvedValue({ membership: { ...membership, role: GymRole.OWNER }, memberships: [], selectionRequired: false });
    mocks.prisma.gymMembership.count.mockResolvedValueOnce(20).mockResolvedValueOnce(4);
    mocks.prisma.approvalRequest.count.mockResolvedValue(2);
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleGymCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Power Coach"));
  });

  it("restricts /admin and provides a secret-free aggregate to super admin", async () => {
    const blocked = context() as { reply: ReturnType<typeof vi.fn> };
    await handleAdminCommand(blocked as never);
    expect(blocked.reply).toHaveBeenCalledWith(expect.stringContaining("مدير المنصة"));
    mocks.findUserByTelegramId.mockResolvedValue({ id: "admin", systemRole: SystemRole.SUPER_ADMIN });
    mocks.prisma.gym.count.mockResolvedValue(2);
    mocks.prisma.user.count.mockResolvedValue(10);
    mocks.prisma.gymMembership.count.mockResolvedValue(8);
    mocks.prisma.approvalRequest.count.mockResolvedValue(1);
    mocks.prisma.aIEvent.count.mockResolvedValue(30);
    const allowed = context() as { reply: ReturnType<typeof vi.fn> };
    await handleAdminCommand(allowed as never);
    expect(allowed.reply).toHaveBeenCalledWith(expect.stringContaining("سجلات الذكاء الاصطناعي: 30"));
  });
});
