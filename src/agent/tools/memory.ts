import { rememberPreference, forgetOptionalMemory, getSafeMemorySummary } from "../../services/agent-memory.js";
import { emptyToolInputSchema, forgetMemoryInputSchema, rememberPreferenceInputSchema } from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

export const memoryTools: AgentToolDefinition[] = [
  {
    name: "get_fitness_memory",
    description: "Read safe user-relevant structured preferences and optional durable fitness memories for the authenticated user.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => getSafeMemorySummary(actor.userId, actor.gymId ?? undefined),
  },
  {
    name: "remember_preference",
    description: "Save only an explicit durable non-sensitive fitness preference. Food likes/dislikes are stored in structured profile fields first.",
    category: ToolCategory.ACTION,
    schema: rememberPreferenceInputSchema,
    handler: async (input, { actor }) => {
      const parsed = rememberPreferenceInputSchema.parse(input);
      const result = await rememberPreference({
        userId: actor.userId,
        ...(actor.gymId ? { gymId: actor.gymId } : {}),
        category: parsed.category,
        key: parsed.key,
        value: parsed.value,
        source: "USER_STATED",
        confidence: 1,
      });
      return result.storage === "STRUCTURED_PROFILE"
        ? result
        : {
            storage: result.storage,
            memory: {
              id: result.memory.id,
              category: result.memory.category,
              key: result.memory.key,
              value: result.memory.value,
            },
          };
    },
  },
  {
    name: "forget_memory",
    description: "Deactivate one optional AgentMemory belonging to the authenticated user. Cannot delete workout, progress, audit, security, or structured operational history.",
    category: ToolCategory.ACTION,
    schema: forgetMemoryInputSchema,
    handler: async (input, { actor }) => forgetOptionalMemory(actor.userId, forgetMemoryInputSchema.parse(input).memoryId),
  },
];
