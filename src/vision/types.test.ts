import { describe, expect, it } from "vitest";
import { visionAnalysisSchema } from "./types.js";

const safeAnalysis = {
  overallSummary: "يبدو أكو تحسن بسيط بوضوح الكتفين مقارنة بالصور السابقة.",
  frontSummary: "الوقفة الأمامية متقاربة.",
  sideSummary: null,
  backSummary: null,
  symmetryNotes: null,
  postureNotes: "زاوية الوقفة مختلفة شوي.",
  muscularityNotes: "يظهر تطور عام بشكل تقريبي.",
  leannessNotes: "يبدو أن مستوى الدهون أقل مقارنة بالصورة السابقة.",
  comparisonSummary: "الإضاءة مختلفة لذلك المقارنة تقريبية.",
  confidenceLabel: "MEDIUM" as const,
};

describe("vision analysis validation", () => {
  it("accepts concise structured fitness observations", () => {
    expect(visionAnalysisSchema.parse(safeAnalysis)).toEqual(safeAnalysis);
  });

  it("has no exact body-fat percentage field", () => {
    expect(() => visionAnalysisSchema.parse({ ...safeAnalysis, bodyFatPercentage: 14.3 })).toThrow();
  });

  it("rejects exact body-fat percentage claims in summaries", () => {
    expect(() => visionAnalysisSchema.parse({
      ...safeAnalysis,
      leannessNotes: "نسبة الدهون 14.3%",
    })).toThrow(/body-fat/i);
  });

  it("rejects medical and sensitive-trait inferences", () => {
    expect(() => visionAnalysisSchema.parse({
      ...safeAnalysis,
      overallSummary: "This image suggests a disease diagnosis.",
    })).toThrow(/Medical/i);
  });

  it("rejects exact muscle-mass and sexualized claims", () => {
    expect(() => visionAnalysisSchema.parse({
      ...safeAnalysis,
      muscularityNotes: "Gained exactly 2 kg muscle.",
    })).toThrow(/muscle-mass/i);
    expect(() => visionAnalysisSchema.parse({
      ...safeAnalysis,
      overallSummary: "The person looks sexually attractive.",
    })).toThrow(/Sexualized/i);
  });
});
