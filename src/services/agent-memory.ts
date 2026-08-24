import { z } from "zod";
import { AgentMemoryCategory, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { normalizeUserList } from "../nutrition/validation.js";

const memoryKeySchema = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}_-]+$/u);
const memoryValueSchema = z.string().trim().min(1).max(300);
const unsafeMemoryPattern = /(password|passcode|api[_ -]?key|token|secret|diagnos|سرطان|سكري|اكتئاب|تشخيص|دواء|كلمة السر|رمز الدخول)/iu;

export class AgentMemoryError extends Error {
  constructor(
    public readonly code: "INVALID_MEMORY" | "SENSITIVE_MEMORY" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AgentMemoryError";
  }
}

export interface RememberPreferenceInput {
  userId: string;
  gymId?: string;
  category: AgentMemoryCategory;
  key: string;
  value: string;
  source?: string;
  confidence?: number;
}

function validateMemory(input: RememberPreferenceInput) {
  const parsed = z.object({
    key: memoryKeySchema,
    value: memoryValueSchema,
    confidence: z.number().finite().min(0).max(1).optional(),
    source: z.string().trim().min(1).max(80).optional(),
  }).strict().safeParse({
    key: input.key,
    value: input.value,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
  });
  if (!parsed.success) throw new AgentMemoryError("INVALID_MEMORY", "Memory preference is invalid");
  if (unsafeMemoryPattern.test(parsed.data.key) || unsafeMemoryPattern.test(parsed.data.value)) {
    throw new AgentMemoryError("SENSITIVE_MEMORY", "Sensitive or medical-diagnosis memory is not allowed");
  }
  return parsed.data;
}

async function addStructuredFoodPreference(
  userId: string,
  field: "foodPreferences" | "dislikedFoods",
  value: string,
) {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) throw new AgentMemoryError("NOT_FOUND", "User profile not found");
  const values = normalizeUserList(profile[field]);
  if (!values.some((item) => item.localeCompare(value, undefined, { sensitivity: "accent" }) === 0)) {
    values.push(value);
  }
  await prisma.userProfile.update({
    where: { userId },
    data: { [field]: values as Prisma.InputJsonArray },
  });
  return { storage: "STRUCTURED_PROFILE" as const, field, value };
}

export async function rememberPreference(input: RememberPreferenceInput) {
  const parsed = validateMemory(input);
  if (input.category === AgentMemoryCategory.FOOD_DISLIKE) {
    return addStructuredFoodPreference(input.userId, "dislikedFoods", parsed.value);
  }
  if (input.category === AgentMemoryCategory.FOOD_PREFERENCE) {
    return addStructuredFoodPreference(input.userId, "foodPreferences", parsed.value);
  }
  const memory = await prisma.agentMemory.upsert({
    where: { userId_category_key: { userId: input.userId, category: input.category, key: parsed.key } },
    update: {
      gymId: input.gymId ?? null,
      value: parsed.value,
      source: parsed.source ?? null,
      confidence: parsed.confidence ?? null,
      isActive: true,
      lastConfirmedAt: new Date(),
    },
    create: {
      userId: input.userId,
      gymId: input.gymId ?? null,
      category: input.category,
      key: parsed.key,
      value: parsed.value,
      source: parsed.source ?? null,
      confidence: parsed.confidence ?? null,
      lastConfirmedAt: new Date(),
    },
  });
  return { storage: "AGENT_MEMORY" as const, memory };
}

export async function listAgentMemories(userId: string, gymId?: string) {
  return prisma.agentMemory.findMany({
    where: {
      userId,
      isActive: true,
      ...(gymId ? { OR: [{ gymId }, { gymId: null }] } : { gymId: null }),
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, category: true, key: true, value: true, updatedAt: true },
  });
}

export async function getSafeMemorySummary(userId: string, gymId?: string) {
  const [profile, memories] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId },
      select: { foodPreferences: true, dislikedFoods: true },
    }),
    listAgentMemories(userId, gymId),
  ]);
  return {
    foodPreferences: normalizeUserList(profile?.foodPreferences),
    dislikedFoods: normalizeUserList(profile?.dislikedFoods),
    memories: memories.map((memory) => ({
      id: memory.id,
      category: memory.category,
      key: memory.key,
      value: typeof memory.value === "string" ? memory.value : null,
    })).filter((memory) => memory.value !== null),
  };
}

export async function forgetOptionalMemory(userId: string, memoryId: string) {
  const parsedId = z.string().trim().min(1).max(100).parse(memoryId);
  const result = await prisma.agentMemory.updateMany({
    where: { id: parsedId, userId, isActive: true },
    data: { isActive: false },
  });
  if (result.count !== 1) throw new AgentMemoryError("NOT_FOUND", "Optional memory not found");
  return { memoryId: parsedId, forgotten: true };
}
