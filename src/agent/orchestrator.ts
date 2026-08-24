import { AIToolExecutionStatus } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { safeErrorMessage, truncateText } from "../utils/text.js";
import { buildAgentContext } from "./context.js";
import { AgentToolError, AgentUnavailableError } from "./errors.js";
import { createAgentEvent, finishAgentEventError, finishAgentEventSuccess, logToolExecution } from "./observability.js";
import { composeAgentInstructions, hasPotentiallySeriousSymptoms } from "./policies.js";
import { OpenAIResponsesAgentProvider } from "./provider.js";
import { agentToolRegistry, type AgentToolRegistry } from "./registry.js";
import type { AgentProvider, AgentProviderToolOutput, AgentRunResult } from "./types.js";

export const MAX_TOOL_ROUNDS = 5;
export const MAX_TOTAL_TOOL_CALLS = 8;
const LOOP_EXHAUSTED_MESSAGE = "ما گدرت أكمل الطلب تلقائياً هالمرة. جرّب تحددلي شنو تريد بشكل أبسط.";
const ACTION_FAILED_MESSAGE = "ما گدرت أنفذ العملية هسه، وما صار أي نجاح مؤكد. حاول مرة ثانية بعد شوية.";
const SERIOUS_SYMPTOM_MESSAGE = "الأعراض اللي ذكرتها ممكن تحتاج تقييم طبي مناسب. وقف التمرين حالياً، وإذا الأعراض قوية أو مستمرة اطلب مساعدة طبية عاجلة. ما أگدر أشخّص الحالة أو أوصف دواء.";

export async function runAgent(input: {
  userId: string;
  message: string;
  requestedGymId?: string;
  provider?: AgentProvider;
  registry?: AgentToolRegistry;
}): Promise<AgentRunResult> {
  const message = input.message.trim();
  if (!message || message.length > 4_000) throw new AgentUnavailableError("Invalid Agent message");
  const startedAt = Date.now();
  const context = await buildAgentContext(input.userId, input.requestedGymId);
  const event = await createAgentEvent({
    userId: input.userId,
    ...(context.actor.gymId ? { gymId: context.actor.gymId } : {}),
    model: env.OPENAI_MODEL,
    message,
  });
  if (context.actor.gymSelectionRequired) {
    const answer = `عندك أكثر من قاعة مرتبطة بحسابك. حدد القاعة أولاً: ${context.gymOptions.map((gym) => gym.name).join("، ")}.`;
    await finishAgentEventSuccess({ aiEventId: event.id, model: "DETERMINISTIC", output: answer, latencyMs: Date.now() - startedAt });
    return { answer, aiEventId: event.id, toolCalls: 0, model: "DETERMINISTIC" };
  }
  if (hasPotentiallySeriousSymptoms(message)) {
    await finishAgentEventSuccess({ aiEventId: event.id, model: "DETERMINISTIC_SAFETY", output: SERIOUS_SYMPTOM_MESSAGE, latencyMs: Date.now() - startedAt });
    return { answer: SERIOUS_SYMPTOM_MESSAGE, aiEventId: event.id, toolCalls: 0, model: "DETERMINISTIC_SAFETY" };
  }
  const registry = input.registry ?? agentToolRegistry;
  let provider: AgentProvider;
  try {
    provider = input.provider ?? new OpenAIResponsesAgentProvider();
  } catch (error) {
    await finishAgentEventError({ aiEventId: event.id, model: env.OPENAI_MODEL, error, latencyMs: Date.now() - startedAt });
    throw new AgentUnavailableError();
  }
  const instructions = composeAgentInstructions(context);
  const tools = registry.providerTools(context.actor);
  let previousResponseId: string | undefined;
  let toolOutputs: AgentProviderToolOutput[] | undefined;
  let toolRounds = 0;
  let totalToolCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let model = env.OPENAI_MODEL;
  let failedAction = false;
  try {
    while (true) {
      const response = await provider.run({
        instructions,
        tools,
        ...(!previousResponseId ? { input: message } : { previousResponseId, toolOutputs: toolOutputs! }),
      });
      model = response.model;
      totalInputTokens += response.inputTokens ?? 0;
      totalOutputTokens += response.outputTokens ?? 0;
      if (!response.toolCalls.length) {
        const answer = failedAction ? ACTION_FAILED_MESSAGE : truncateText(response.outputText.trim(), 4_000);
        if (!answer) throw new Error("Agent provider returned no final answer");
        await finishAgentEventSuccess({
          aiEventId: event.id,
          model,
          output: answer,
          latencyMs: Date.now() - startedAt,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
        return { answer, aiEventId: event.id, toolCalls: totalToolCalls, model };
      }
      if (toolRounds >= MAX_TOOL_ROUNDS || totalToolCalls + response.toolCalls.length > MAX_TOTAL_TOOL_CALLS) {
        throw new AgentToolError("EXECUTION_FAILED", "Agent tool execution limit reached");
      }
      toolRounds += 1;
      totalToolCalls += response.toolCalls.length;
      previousResponseId = response.id;
      toolOutputs = [];
      for (const call of response.toolCalls) {
        const executionStartedAt = Date.now();
        try {
          if (call.parseError) throw new AgentToolError("INVALID_INPUT", call.parseError);
          const output = await registry.execute(call.name, call.arguments, { actor: context.actor, aiEventId: event.id });
          await logToolExecution({
            aiEventId: event.id,
            userId: input.userId,
            ...(context.actor.gymId ? { gymId: context.actor.gymId } : {}),
            toolName: call.name,
            status: AIToolExecutionStatus.SUCCESS,
            durationMs: Date.now() - executionStartedAt,
            toolInput: call.arguments,
            output,
          });
          toolOutputs.push({ callId: call.callId, name: call.name, output: JSON.stringify({ ok: true, data: output }) });
        } catch (error) {
          const status = error instanceof AgentToolError && error.code === "TIMEOUT"
            ? AIToolExecutionStatus.TIMEOUT
            : error instanceof AgentToolError && new Set(["UNKNOWN_TOOL", "INVALID_INPUT", "FORBIDDEN"]).has(error.code)
              ? AIToolExecutionStatus.REJECTED
              : AIToolExecutionStatus.ERROR;
          failedAction = true;
          const errorMessage = safeErrorMessage(error, [env.OPENAI_API_KEY ?? "", env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]);
          await logToolExecution({
            aiEventId: event.id,
            userId: input.userId,
            ...(context.actor.gymId ? { gymId: context.actor.gymId } : {}),
            toolName: call.name,
            status,
            durationMs: Date.now() - executionStartedAt,
            toolInput: call.arguments,
            error,
          });
          toolOutputs.push({
            callId: call.callId,
            name: call.name,
            output: JSON.stringify({ ok: false, error: { code: error instanceof AgentToolError ? error.code : "EXECUTION_FAILED", message: truncateText(errorMessage, 300) } }),
          });
        }
      }
    }
  } catch (error) {
    const exhausted = error instanceof AgentToolError && error.message.includes("limit");
    await finishAgentEventError({ aiEventId: event.id, model, error, latencyMs: Date.now() - startedAt });
    if (exhausted) return { answer: LOOP_EXHAUSTED_MESSAGE, aiEventId: event.id, toolCalls: totalToolCalls, model };
    throw new AgentUnavailableError();
  }
}
