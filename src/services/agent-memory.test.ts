import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMemoryCategory } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  prisma: {
    userProfile: { findUnique: vi.fn(), update: vi.fn() },
    agentMemory: { upsert: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { AgentMemoryError, forgetOptionalMemory, getSafeMemorySummary, rememberPreference } from "./agent-memory.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.userProfile.findUnique.mockResolvedValue({ foodPreferences: ["رز"], dislikedFoods: ["سمچ"] });
  mocks.prisma.userProfile.update.mockResolvedValue({});
  mocks.prisma.agentMemory.findMany.mockResolvedValue([]);
  mocks.prisma.agentMemory.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.agentMemory.upsert.mockResolvedValue({ id: "memory-a" });
});

describe("long-term Agent memory", () => {
  it("stores food dislikes in the structured profile first", async () => {
    const result = await rememberPreference({ userId: "member-a", category: AgentMemoryCategory.FOOD_DISLIKE, key: "food_fish", value: "تونة" });
    expect(result.storage).toBe("STRUCTURED_PROFILE");
    expect(mocks.prisma.userProfile.update).toHaveBeenCalledWith({ where: { userId: "member-a" }, data: { dislikedFoods: ["سمچ", "تونة"] } });
    expect(mocks.prisma.agentMemory.upsert).not.toHaveBeenCalled();
  });

  it("does not duplicate an existing structured food preference", async () => {
    await rememberPreference({ userId: "member-a", category: AgentMemoryCategory.FOOD_PREFERENCE, key: "rice", value: "رز" });
    expect(mocks.prisma.userProfile.update).toHaveBeenCalledWith({ where: { userId: "member-a" }, data: { foodPreferences: ["رز"] } });
  });

  it("upserts a durable schedule preference instead of creating duplicates", async () => {
    await rememberPreference({ userId: "member-a", gymId: "gym-a", category: AgentMemoryCategory.SCHEDULE_PREFERENCE, key: "training_time", value: "بالليل", source: "USER_STATED", confidence: 1 });
    expect(mocks.prisma.agentMemory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_category_key: { userId: "member-a", category: AgentMemoryCategory.SCHEDULE_PREFERENCE, key: "training_time" } },
    }));
  });

  it("rejects sensitive credentials and casual medical diagnoses", async () => {
    await expect(rememberPreference({ userId: "member-a", category: AgentMemoryCategory.USER_STATED_CONSTRAINT, key: "api_key", value: "secret" })).rejects.toBeInstanceOf(AgentMemoryError);
    await expect(rememberPreference({ userId: "member-a", category: AgentMemoryCategory.USER_STATED_CONSTRAINT, key: "health", value: "تشخيص سكري" })).rejects.toMatchObject({ code: "SENSITIVE_MEMORY" });
    expect(mocks.prisma.agentMemory.upsert).not.toHaveBeenCalled();
  });

  it("forgets only an optional memory scoped to the authenticated user", async () => {
    await expect(forgetOptionalMemory("member-a", "memory-a")).resolves.toEqual({ memoryId: "memory-a", forgotten: true });
    expect(mocks.prisma.agentMemory.updateMany).toHaveBeenCalledWith({ where: { id: "memory-a", userId: "member-a", isActive: true }, data: { isActive: false } });
  });

  it("returns only safe string-valued memory and structured food fields", async () => {
    mocks.prisma.agentMemory.findMany.mockResolvedValue([
      { id: "memory-a", category: AgentMemoryCategory.TRAINING_PREFERENCE, key: "days", value: "4 أيام", updatedAt: new Date() },
      { id: "memory-b", category: AgentMemoryCategory.USER_STATED_CONSTRAINT, key: "nested", value: { private: true }, updatedAt: new Date() },
    ]);
    const result = await getSafeMemorySummary("member-a");
    expect(result.dislikedFoods).toEqual(["سمچ"]);
    expect(result.memories).toEqual([{ id: "memory-a", category: AgentMemoryCategory.TRAINING_PREFERENCE, key: "days", value: "4 أيام" }]);
  });
});
