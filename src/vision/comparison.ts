import type { PhotoComparisonResult, VisionAnalysisResult } from "./types.js";

const comparisonFields: Array<keyof Pick<
  VisionAnalysisResult,
  "muscularityNotes" | "leannessNotes" | "symmetryNotes" | "postureNotes"
>> = ["muscularityNotes", "leannessNotes", "symmetryNotes", "postureNotes"];

export function compareAnalysisResults(
  previous: VisionAnalysisResult | null,
  current: VisionAnalysisResult | null,
): PhotoComparisonResult {
  if (!previous) {
    return {
      summary: "ماكو تحليل سابق مكتمل للمقارنة.",
      visibleChanges: [],
      caveats: ["نحتاج متابعة صور سابقة مكتملة حتى نوصف التغيير النسبي."],
    };
  }
  if (!current) {
    return {
      summary: "التحليل الحالي غير مكتمل، لذلك ما نكدر نسوي مقارنة موثوقة.",
      visibleChanges: [],
      caveats: ["المقارنة تحتاج تحليلين مكتملين."],
    };
  }
  const visibleChanges = comparisonFields
    .filter((field) => current[field] && current[field] !== previous[field])
    .map((field) => current[field] as string);
  const caveats: string[] = [];
  if (current.confidenceLabel === "LOW") {
    caveats.push("ثقة التحليل منخفضة بسبب جودة الصور أو اختلاف ظروف التصوير.");
  }
  if (!current.comparisonSummary) {
    caveats.push("الصور أو الزوايا ما سمحت بمقارنة مباشرة كاملة.");
  }
  return {
    summary: current.comparisonSummary ?? "ما ظهر فرق واضح يمكن وصفه بثقة بين المتابعتين.",
    visibleChanges,
    caveats,
  };
}
