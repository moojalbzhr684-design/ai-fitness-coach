import { NutritionPlanStatus } from "../generated/prisma/client.js";

interface NutritionPlanArchiveStore {
  nutritionPlan: {
    updateMany(args: {
      where: { userId: string; status: NutritionPlanStatus };
      data: { status: NutritionPlanStatus; endedAt: Date };
    }): Promise<{ count: number }>;
  };
}

export function archiveActiveNutritionPlans(
  store: NutritionPlanArchiveStore,
  userId: string,
  endedAt: Date,
): Promise<{ count: number }> {
  return store.nutritionPlan.updateMany({
    where: { userId, status: NutritionPlanStatus.ACTIVE },
    data: { status: NutritionPlanStatus.ARCHIVED, endedAt },
  });
}
