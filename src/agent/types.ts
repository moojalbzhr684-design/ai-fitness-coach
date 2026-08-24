import type { GymRole, SystemRole } from "../generated/prisma/client.js";
import type { z } from "zod";

export const ToolCategory = {
  READ: "READ",
  ACTION: "ACTION",
  PRIVILEGED: "PRIVILEGED",
} as const;
export type ToolCategory = typeof ToolCategory[keyof typeof ToolCategory];

export interface AgentActor {
  userId: string;
  gymId: string | null;
  systemRole: SystemRole;
  gymRole: GymRole | null;
  allowActions: boolean;
  gymSelectionRequired: boolean;
}

export interface AgentExecutionContext {
  actor: AgentActor;
  aiEventId: string;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  schema: z.ZodType;
  requiresGym?: boolean;
  allowedGymRoles?: GymRole[];
  handler: (input: unknown, context: AgentExecutionContext) => Promise<unknown>;
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
}

export interface AgentProviderToolCall {
  callId: string;
  name: string;
  arguments: unknown;
  parseError?: string;
}

export interface AgentProviderToolOutput {
  callId: string;
  name: string;
  output: string;
}

export interface AgentProviderRequest {
  instructions: string;
  tools: ProviderToolDefinition[];
  input?: string;
  previousResponseId?: string;
  toolOutputs?: AgentProviderToolOutput[];
}

export interface AgentProviderResponse {
  id: string;
  model: string;
  outputText: string;
  toolCalls: AgentProviderToolCall[];
  inputTokens?: number;
  outputTokens?: number;
}

export interface AgentProvider {
  run(request: AgentProviderRequest): Promise<AgentProviderResponse>;
}

export interface AgentRunResult {
  answer: string;
  aiEventId: string;
  toolCalls: number;
  model: string;
}
