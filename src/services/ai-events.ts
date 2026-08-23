import { AIEventStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { truncateText } from "../utils/text.js";

interface BaseAIEvent {
  userId: string;
  gymId?: string;
  eventType: string;
  model?: string;
  latencyMs?: number;
  inputSummary?: string;
}

export async function logAIEventSuccess(
  event: BaseAIEvent & {
    outputSummary?: string;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostUsd?: number;
  },
) {
  return prisma.aIEvent.create({
    data: {
      userId: event.userId,
      gymId: event.gymId ?? null,
      eventType: event.eventType,
      status: AIEventStatus.SUCCESS,
      model: event.model ?? null,
      latencyMs: event.latencyMs ?? null,
      inputSummary: event.inputSummary ? truncateText(event.inputSummary) : null,
      outputSummary: event.outputSummary ? truncateText(event.outputSummary) : null,
      inputTokens: event.inputTokens ?? null,
      outputTokens: event.outputTokens ?? null,
      estimatedCostUsd: event.estimatedCostUsd ?? null,
    },
  });
}

export async function logAIEventError(
  event: BaseAIEvent & { errorMessage: string },
) {
  return prisma.aIEvent.create({
    data: {
      userId: event.userId,
      gymId: event.gymId ?? null,
      eventType: event.eventType,
      status: AIEventStatus.ERROR,
      model: event.model ?? null,
      latencyMs: event.latencyMs ?? null,
      inputSummary: event.inputSummary ? truncateText(event.inputSummary) : null,
      errorMessage: truncateText(event.errorMessage, 1_000),
    },
  });
}
