import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, SystemRole } from "../../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  activePlan: vi.fn(), targets: vi.fn(), mealSummary: vi.fn(), macros: vi.fn(), alternatives: vi.fn(),
  progressSummary: vi.fn(), latestCheckIn: vi.fn(), recentMeasurements: vi.fn(), latestDecision: vi.fn(),
  latestPhoto: vi.fn(), photoProgress: vi.fn(),
}));
vi.mock("../../services/nutrition-plans.js", () => ({
  getActiveNutritionPlan: mocks.activePlan,
  getNutritionTargets: mocks.targets,
  getMealPlanSummary: mocks.mealSummary,
}));
vi.mock("../../services/foods.js", () => ({
  getFoodMacrosByReference: mocks.macros,
  getMealItemAlternatives: mocks.alternatives,
}));
vi.mock("../../services/progress.js", () => ({
  getProgressSummary: mocks.progressSummary,
  getLatestCheckIn: mocks.latestCheckIn,
  getRecentMeasurements: mocks.recentMeasurements,
  getLatestProgressDecision: mocks.latestDecision,
}));
vi.mock("../../services/photo-analysis.js", () => ({
  getLatestPhotoAnalysisSummary: mocks.latestPhoto,
  getPhotoProgressSummary: mocks.photoProgress,
}));

import { nutritionTools } from "./nutrition.js";
import { photoTools } from "./photos.js";
import { progressTools } from "./progress.js";

const actor = { userId: "member-a", gymId: "gym-a", systemRole: SystemRole.USER, gymRole: GymRole.MEMBER, allowActions: true, gymSelectionRequired: false };
const context = { actor, aiEventId: "event-a" };
const find = (tools: typeof nutritionTools, name: string) => {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`missing ${name}`);
  return tool;
};

beforeEach(() => vi.clearAllMocks());

describe("nutrition Agent tools", () => {
  it("uses the Food database service for approximate macro questions", async () => {
    mocks.macros.mockResolvedValue({ match: { name: "Chicken breast", nameAr: "صدر دجاج", quantityGrams: 200, calories: 330, proteinGrams: 62, carbsGrams: 0, fatGrams: 7 }, options: [] });
    const result = await find(nutritionTools, "get_food_macros").handler({ foodReference: "دجاج", quantityGrams: 200 }, context);
    expect(mocks.macros).toHaveBeenCalledWith("دجاج", 200);
    expect(result).toMatchObject({ status: "found", approximate: true, proteinGrams: 62 });
  });

  it("uses the real substitution service with the authenticated user and calculated quantity", async () => {
    mocks.alternatives.mockResolvedValue({
      item: { quantityGrams: 150, food: { name: "Chicken breast", nameAr: "صدر دجاج" } },
      alternatives: [{ food: { name: "Lean beef", nameAr: "لحم قليل الدهون" }, quantityGrams: 135, calories: 300, proteinGrams: 45, carbsGrams: 0, fatGrams: 12 }],
    });
    const result = await find(nutritionTools, "find_food_substitutions").handler({ mealNumber: 2, foodNumber: 1 }, context);
    expect(mocks.alternatives).toHaveBeenCalledWith("member-a", 2, 1);
    expect(result).toMatchObject({ status: "found", original: { quantityGrams: 150 }, alternatives: [{ quantityGrams: 135 }] });
  });

  it("preserves a no-safe-alternative result from allergy/restriction filtering", async () => {
    mocks.alternatives.mockResolvedValue({ item: { quantityGrams: 150, food: { name: "Chicken", nameAr: null } }, alternatives: [] });
    await expect(find(nutritionTools, "find_food_substitutions").handler({ mealNumber: 1, foodNumber: 1 }, context)).resolves.toMatchObject({ status: "no_safe_alternatives" });
  });
});

describe("progress and photo Agent tools", () => {
  it("returns the database-derived progress summary and stored decision reason", async () => {
    mocks.progressSummary.mockResolvedValue({ startingWeightKg: 90, currentWeightKg: 85, totalChangeKg: -5, trend: { kgPerWeek: -0.4 } });
    mocks.latestDecision.mockResolvedValue({ reason: "الالتزام واطي، نخلي السعرات ثابتة", newValue: { action: "KEEP_CURRENT_PLAN" } });
    await expect(find(progressTools, "get_progress_summary").handler({}, context)).resolves.toMatchObject({ totalChangeKg: -5 });
    await expect(find(progressTools, "get_latest_progress_decision").handler({}, context)).resolves.toMatchObject({ reason: "الالتزام واطي، نخلي السعرات ثابتة" });
    expect(mocks.progressSummary).toHaveBeenCalledWith("member-a");
  });

  it("handles missing progress history safely", async () => {
    mocks.latestCheckIn.mockResolvedValue(null);
    await expect(find(progressTools, "get_latest_checkin").handler({}, context)).resolves.toBeNull();
  });

  it("returns text-only photo summaries without raw references or exact body fat", async () => {
    mocks.photoProgress.mockResolvedValue({ overallSummary: "تحسن بسيط بالوقفة", comparisonSummary: "فرق تدريجي", confidenceLabel: "medium" });
    const result = await find(photoTools, "get_photo_progress_summary").handler({}, context);
    expect(JSON.stringify(result)).not.toMatch(/telegramFileId|storageKey|imageUrl|bodyFat|%/i);
    expect(result).toMatchObject({ status: "found", summary: { comparisonSummary: "فرق تدريجي" } });
  });
});
