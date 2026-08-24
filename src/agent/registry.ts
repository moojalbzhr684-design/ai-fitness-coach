import { GymRole, SystemRole } from "../generated/prisma/client.js";
import { AgentToolError } from "./errors.js";
import { memoryTools } from "./tools/memory.js";
import { nutritionTools } from "./tools/nutrition.js";
import { photoTools } from "./tools/photos.js";
import { profileTools } from "./tools/profile.js";
import { progressTools } from "./tools/progress.js";
import { trainerTools } from "./tools/trainer.js";
import { workoutTools } from "./tools/workout.js";
import { ToolCategory, type AgentActor, type AgentExecutionContext, type AgentToolDefinition, type ProviderToolDefinition } from "./types.js";

export const TOOL_EXECUTION_TIMEOUT_MS = 8_000;

function privileged(actor: AgentActor) {
  return actor.systemRole === SystemRole.SUPER_ADMIN
    || actor.gymRole === GymRole.OWNER
    || actor.gymRole === GymRole.TRAINER;
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor(definitions: AgentToolDefinition[]) {
    for (const definition of definitions) {
      if (this.tools.has(definition.name)) throw new Error(`Duplicate Agent tool: ${definition.name}`);
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(definition.name)) throw new Error(`Invalid Agent tool name: ${definition.name}`);
      this.tools.set(definition.name, definition);
    }
  }

  has(name: string) {
    return this.tools.has(name);
  }

  get(name: string) {
    return this.tools.get(name) ?? null;
  }

  isAvailable(name: string, actor: AgentActor) {
    const tool = this.tools.get(name);
    if (!tool) return false;
    if (tool.category === ToolCategory.ACTION && !actor.allowActions) return false;
    if (tool.category === ToolCategory.PRIVILEGED && !privileged(actor)) return false;
    if (tool.allowedGymRoles && (!actor.gymRole || !tool.allowedGymRoles.includes(actor.gymRole))) return false;
    if (tool.requiresGym && !actor.gymId) return false;
    if (actor.gymSelectionRequired && tool.requiresGym) return false;
    return true;
  }

  providerTools(actor: AgentActor): ProviderToolDefinition[] {
    return [...this.tools.values()]
      .filter((tool) => this.isAvailable(tool.name, actor))
      .map((tool) => ({ name: tool.name, description: tool.description, schema: tool.schema }));
  }

  async execute(name: string, rawInput: unknown, context: AgentExecutionContext, timeoutMs = TOOL_EXECUTION_TIMEOUT_MS) {
    const tool = this.tools.get(name);
    if (!tool) throw new AgentToolError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
    if (!this.isAvailable(name, context.actor)) throw new AgentToolError("FORBIDDEN", `Tool is unavailable for this actor: ${name}`);
    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) throw new AgentToolError("INVALID_INPUT", `Invalid input for ${name}`);
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        tool.handler(parsed.data, context),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new AgentToolError("TIMEOUT", `Tool timed out: ${name}`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export const agentToolRegistry = new AgentToolRegistry([
  ...profileTools,
  ...workoutTools,
  ...nutritionTools,
  ...progressTools,
  ...photoTools,
  ...trainerTools,
  ...memoryTools,
]);
