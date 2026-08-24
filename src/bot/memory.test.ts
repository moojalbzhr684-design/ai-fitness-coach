import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { AgentMemoryCategory } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(), memberships: vi.fn(), summary: vi.fn(), trainer: vi.fn(), forget: vi.fn(),
}));
vi.mock("../services/users.js", () => ({ findUserByTelegramId: mocks.findUser }));
vi.mock("../auth/gym-scope.js", () => ({ getActiveGymMemberships: mocks.memberships }));
vi.mock("../services/agent-memory.js", () => ({ getSafeMemorySummary: mocks.summary, forgetOptionalMemory: mocks.forget }));
vi.mock("../services/trainers.js", () => ({ getMemberTrainer: mocks.trainer }));

import { handleForgetCommand, handleMemoryCommand } from "./memory.js";

function context() {
  const reply = vi.fn();
  return { ctx: { from: { id: 123 }, reply } as unknown as Context, reply };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue({ id: "member-a" });
  mocks.memberships.mockResolvedValue([{ gymId: "gym-a" }]);
  mocks.summary.mockResolvedValue({
    foodPreferences: ["رز"], dislikedFoods: ["سمچ"],
    memories: [{ id: "memory-a", category: AgentMemoryCategory.SCHEDULE_PREFERENCE, key: "training_time", value: "بالليل" }],
  });
  mocks.trainer.mockResolvedValue({ trainer: { firstName: "أحمد", trainerProfile: null } });
  mocks.forget.mockResolvedValue({ forgotten: true });
});

describe("Telegram memory commands", () => {
  it("/memory shows only safe user-relevant fitness memory", async () => {
    const { ctx, reply } = context();
    await handleMemoryCommand(ctx);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("ما تحب سمچ"));
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("بالليل"));
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("أحمد"));
    expect(reply).not.toHaveBeenCalledWith(expect.stringMatching(/system|prompt|metadata|memory-a/i));
  });

  it("/forget resolves a numbered optional memory and never addresses operational records", async () => {
    const { ctx, reply } = context();
    await handleForgetCommand(ctx, "1");
    expect(mocks.forget).toHaveBeenCalledWith("member-a", "memory-a");
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("السجلات التشغيلية والتاريخ الرياضي ما تغيرت"));
  });
});
