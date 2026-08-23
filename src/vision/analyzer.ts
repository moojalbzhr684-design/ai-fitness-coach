import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { env } from "../config/env.js";
import { buildVisionInputText, VISION_ANALYSIS_INSTRUCTIONS } from "./prompts.js";
import {
  visionAnalysisOutputSchema,
  visionAnalysisSchema,
  type VisionAnalysisRequest,
  type VisionAnalyzerClient,
  type VisionModelResult,
} from "./types.js";

export class OpenAIVisionAnalyzer implements VisionAnalyzerClient {
  constructor(
    private readonly client = new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    private readonly model = env.OPENAI_MODEL,
  ) {}

  async analyze(request: VisionAnalysisRequest): Promise<VisionModelResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    if (!request.current.length) {
      throw new Error("At least one current progress photo is required");
    }
    const content: Array<
      | { type: "input_text"; text: string }
      | { type: "input_image"; image_url: string; detail: "high" }
    > = [{ type: "input_text", text: buildVisionInputText(Boolean(request.previous?.length)) }];
    for (const image of request.current) {
      content.push({ type: "input_text", text: `CURRENT ${image.view}` });
      content.push({ type: "input_image", image_url: image.dataUrl, detail: "high" });
    }
    for (const image of request.previous ?? []) {
      content.push({ type: "input_text", text: `PREVIOUS ${image.view}` });
      content.push({ type: "input_image", image_url: image.dataUrl, detail: "high" });
    }
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: VISION_ANALYSIS_INSTRUCTIONS,
      input: [{ role: "user", content }],
      text: {
        format: zodTextFormat(
          visionAnalysisOutputSchema,
          "progress_photo_analysis",
          { description: "Concise, non-medical fitness progress-photo observations" },
        ),
      },
      max_output_tokens: 1_200,
      store: false,
    });
    if (!response.output_parsed) {
      throw new Error("Vision analysis returned no structured output");
    }
    return {
      analysis: visionAnalysisSchema.parse(response.output_parsed),
      model: this.model,
      ...(response.usage?.input_tokens !== undefined
        ? { inputTokens: response.usage.input_tokens }
        : {}),
      ...(response.usage?.output_tokens !== undefined
        ? { outputTokens: response.usage.output_tokens }
        : {}),
    };
  }
}
