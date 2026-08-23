import { describe, expect, it } from "vitest";
import { compareAnalysisResults } from "./comparison.js";
import type { VisionAnalysisResult } from "./types.js";

const analysis = (summary: string): VisionAnalysisResult => ({
  overallSummary: summary,
  frontSummary: null,
  sideSummary: null,
  backSummary: null,
  symmetryNotes: null,
  postureNotes: null,
  muscularityNotes: summary,
  leannessNotes: null,
  comparisonSummary: "يظهر تغير بسيط، بس اختلاف الإضاءة يخلي المقارنة تقريبية.",
  confidenceLabel: "MEDIUM",
});

describe("photo comparison", () => {
  it("handles no previous set safely", () => {
    const result = compareAnalysisResults(null, analysis("الحالي"));
    expect(result.visibleChanges).toEqual([]);
    expect(result.caveats).toHaveLength(1);
  });

  it("compares previous and current completed analyses", () => {
    const result = compareAnalysisResults(analysis("السابق"), analysis("الحالي"));
    expect(result.summary).toContain("تغير بسيط");
    expect(result.visibleChanges).toContain("الحالي");
  });

  it("handles a missing current analysis safely", () => {
    const result = compareAnalysisResults(analysis("السابق"), null);
    expect(result.visibleChanges).toEqual([]);
    expect(result.summary).toContain("غير مكتمل");
  });
});
