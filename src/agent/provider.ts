import OpenAI from "openai";
import { zodResponsesFunction } from "openai/helpers/zod";
import { env } from "../config/env.js";
import type {
  AgentProvider,
  AgentProviderRequest,
  AgentProviderResponse,
} from "./types.js";

export class OpenAIResponsesAgentProvider implements AgentProvider {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    if (!client && !env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    this.client = client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async run(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    const tools = request.tools.map((tool) => zodResponsesFunction({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }));
    const input = request.toolOutputs
      ? request.toolOutputs.map((result) => ({
          type: "function_call_output" as const,
          call_id: result.callId,
          output: result.output,
        }))
      : request.input;
    const response = await this.client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: request.instructions,
      ...(input !== undefined ? { input } : {}),
      tools,
      parallel_tool_calls: false,
      store: true,
      ...(request.previousResponseId ? { previous_response_id: request.previousResponseId } : {}),
    }, { timeout: 45_000 });
    const toolCalls = response.output
      .filter((item) => item.type === "function_call")
      .map((item) => {
        try {
          return { callId: item.call_id, name: item.name, arguments: JSON.parse(item.arguments) as unknown };
        } catch {
          return { callId: item.call_id, name: item.name, arguments: null, parseError: "Malformed function arguments" };
        }
      });
    return {
      id: response.id,
      model: response.model,
      outputText: response.output_text.trim(),
      toolCalls,
      ...(response.usage?.input_tokens !== undefined ? { inputTokens: response.usage.input_tokens } : {}),
      ...(response.usage?.output_tokens !== undefined ? { outputTokens: response.usage.output_tokens } : {}),
    };
  }
}

export class FakeAgentProvider implements AgentProvider {
  public readonly requests: AgentProviderRequest[] = [];
  private index = 0;

  constructor(private readonly responses: Array<AgentProviderResponse | Error>) {}

  async run(request: AgentProviderRequest): Promise<AgentProviderResponse> {
    this.requests.push(request);
    const response = this.responses[this.index++];
    if (!response) throw new Error("FakeAgentProvider script exhausted");
    if (response instanceof Error) throw response;
    return response;
  }
}
