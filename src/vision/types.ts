import { z } from "zod";

const observation = z.string().trim().min(1).max(500).nullable();
const unsafeExactBodyFat = /(?:body\s*fat|fat\s*percentage|نسبة\s*الدهون|دهون)[^\n.%]{0,30}\d+(?:[.,]\d+)?\s*%|\d+(?:[.,]\d+)?\s*%[^\n.]{0,30}(?:body\s*fat|fat|دهون)/iu;
const unsafeExactMuscleMass = /(?:muscle\s*mass|muscle|كتلة\s*عضلية|عضل)[^\n.]{0,30}\d+(?:[.,]\d+)?\s*(?:kg|kilograms?|كغم|كيلو)|\d+(?:[.,]\d+)?\s*(?:kg|kilograms?|كغم|كيلو)[^\n.]{0,30}(?:muscle|عضل)/iu;
const unsafeInference = /(?:diagnos(?:e|is)|disease|ethnicity|religion|sexuality|identify\s+(?:the\s+)?person|تشخيص|مرض|العرق|الديانة|الميول\s*الجنسية|تحديد\s*هوية)/iu;
const unsafeCommentary = /(?:sexually|sexualized|attractive|ugly|disgusting|مثير\s*جنسياً|جذاب\s*جنسياً|قبيح|مقرف)/iu;

export const visionAnalysisOutputSchema = z.object({
  overallSummary: z.string().trim().min(1).max(500),
  frontSummary: observation,
  sideSummary: observation,
  backSummary: observation,
  symmetryNotes: observation,
  postureNotes: observation,
  muscularityNotes: observation,
  leannessNotes: observation,
  comparisonSummary: observation,
  confidenceLabel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
}).strict();

export const visionAnalysisSchema = visionAnalysisOutputSchema.superRefine((value, context) => {
  for (const [field, text] of Object.entries(value)) {
    if (typeof text !== "string") continue;
    if (unsafeExactBodyFat.test(text) || (field === "leannessNotes" && /\d+(?:[.,]\d+)?\s*%/u.test(text))) {
      context.addIssue({ code: "custom", path: [field], message: "Exact body-fat estimates are prohibited" });
    }
    if (unsafeExactMuscleMass.test(text)) {
      context.addIssue({ code: "custom", path: [field], message: "Exact muscle-mass estimates are prohibited" });
    }
    if (unsafeInference.test(text)) {
      context.addIssue({ code: "custom", path: [field], message: "Medical, identity, or sensitive-trait inferences are prohibited" });
    }
    if (unsafeCommentary.test(text)) {
      context.addIssue({ code: "custom", path: [field], message: "Sexualized or shaming commentary is prohibited" });
    }
  }
});

export type VisionAnalysisResult = z.infer<typeof visionAnalysisSchema>;

export interface VisionImageInput {
  view: "FRONT" | "SIDE" | "BACK" | "OTHER";
  dataUrl: string;
}

export interface VisionAnalysisRequest {
  current: VisionImageInput[];
  previous?: VisionImageInput[];
}

export interface VisionModelResult {
  analysis: VisionAnalysisResult;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface VisionAnalyzerClient {
  analyze(request: VisionAnalysisRequest): Promise<VisionModelResult>;
}

export interface PhotoComparisonResult {
  summary: string;
  visibleChanges: string[];
  caveats: string[];
}
