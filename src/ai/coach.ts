import OpenAI from "openai";
import { env } from "../config/env.js";
import { logAIEventError, logAIEventSuccess } from "../services/ai-events.js";
import { getCoachContext } from "../services/users.js";
import { safeErrorMessage, truncateText } from "../utils/text.js";
import { buildCoachInstructions } from "./prompts.js";

export class CoachUnavailableError extends Error {
  constructor() {
    super("Coach AI is temporarily unavailable");
    this.name = "CoachUnavailableError";
  }
}

export async function askCoach(userId: string, message: string): Promise<string> {
  const context = await getCoachContext(userId);

  if (!context) {
    throw new Error("User context not found");
  }

  const gymId = context.gymMemberships[0]?.gymId;
  const startedAt = Date.now();

  try {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: buildCoachInstructions(context),
      input: message,
    });
    const output = response.output_text.trim();

    if (!output) {
      throw new Error("OpenAI returned an empty response");
    }

    await logAIEventSuccess({
      userId,
      ...(gymId ? { gymId } : {}),
      eventType: "CHAT",
      model: env.OPENAI_MODEL,
      latencyMs: Date.now() - startedAt,
      inputSummary: truncateText(message),
      outputSummary: truncateText(output),
      ...(response.usage?.input_tokens !== undefined
        ? { inputTokens: response.usage.input_tokens }
        : {}),
      ...(response.usage?.output_tokens !== undefined
        ? { outputTokens: response.usage.output_tokens }
        : {}),
    });

    return output;
  } catch (error) {
    const errorMessage = safeErrorMessage(error, [
      env.OPENAI_API_KEY ?? "",
      env.TELEGRAM_BOT_TOKEN,
      env.DATABASE_URL,
    ]);

    await logAIEventError({
      userId,
      ...(gymId ? { gymId } : {}),
      eventType: "CHAT",
      model: env.OPENAI_MODEL,
      latencyMs: Date.now() - startedAt,
      inputSummary: truncateText(message),
      errorMessage,
    });

    console.error("AI request failed:", errorMessage);
    throw new CoachUnavailableError();
  }
}
