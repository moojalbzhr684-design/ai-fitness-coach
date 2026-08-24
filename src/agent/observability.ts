import { AIToolExecutionStatus, AIEventStatus } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { safeErrorMessage, truncateText } from "../utils/text.js";

const privateKeyPattern = /(password|secret|token|api.?key|database.?url|telegram.?file|storage.?key|raw.?image|image.?url|chain.?of.?thought|reasoning)/i;

function clean(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const secrets = [env.OPENAI_API_KEY ?? "", env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL].filter(Boolean);
    return truncateText(secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value), 500);
  }
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => clean(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !privateKeyPattern.test(key))
      .slice(0, 30)
      .map(([key, item]) => [key, clean(item, depth + 1)]));
  }
  return String(value);
}
export function safeToolSummary(value: unknown) {
  return truncateText(JSON.stringify(clean(value)), 2_000);
}

export async function createAgentEvent(input: { userId: string; gymId?: string; model?: string; message: string }) {
  return prisma.aIEvent.create({
    data: {
      userId: input.userId,
      gymId: input.gymId ?? null,
      eventType: "AGENT_REQUEST",
      status: AIEventStatus.PROCESSING,
      model: input.model ?? null,
      inputSummary: truncateText(input.message),
    },
  });
}

export async function finishAgentEventSuccess(input: {
  aiEventId: string;
  model: string;
  output: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  return prisma.aIEvent.update({
    where: { id: input.aiEventId },
    data: {
      status: AIEventStatus.SUCCESS,
      model: input.model,
      outputSummary: truncateText(input.output),
      errorMessage: null,
      latencyMs: input.latencyMs,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
    },
  });
}

export async function finishAgentEventError(input: {
  aiEventId: string;
  model?: string;
  error: unknown;
  latencyMs: number;
}) {
  const errorMessage = safeErrorMessage(input.error, [env.OPENAI_API_KEY ?? "", env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]);
  return prisma.aIEvent.update({
    where: { id: input.aiEventId },
    data: {
      status: AIEventStatus.ERROR,
      model: input.model ?? null,
      errorMessage: truncateText(errorMessage, 1_000),
      latencyMs: input.latencyMs,
    },
  });
}

export async function logToolExecution(input: {
  aiEventId: string;
  userId: string;
  gymId?: string;
  toolName: string;
  status: AIToolExecutionStatus;
  durationMs: number;
  toolInput: unknown;
  output?: unknown;
  error?: unknown;
}) {
  return prisma.aIToolExecution.create({
    data: {
      aiEventId: input.aiEventId,
      userId: input.userId,
      gymId: input.gymId ?? null,
      toolName: input.toolName,
      status: input.status,
      durationMs: input.durationMs,
      inputSummary: safeToolSummary(input.toolInput),
      outputSummary: input.output === undefined ? null : safeToolSummary(input.output),
      errorMessage: input.error === undefined ? null : truncateText(safeErrorMessage(input.error, [env.OPENAI_API_KEY ?? "", env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]), 1_000),
    },
  });
}
