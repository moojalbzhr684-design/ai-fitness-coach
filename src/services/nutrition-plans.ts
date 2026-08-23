import {
  MembershipStatus,
  NutritionPlanStatus,
  OnboardingStep,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { calculateNutritionTargets } from "../nutrition/calculator.js";
import { generateNutritionPlan, NutritionGenerationError } from "../nutrition/generator.js";
import { archiveActiveNutritionPlans } from "../nutrition/history.js";
import type { FoodConstraints } from "../nutrition/types.js";
import { validateFoodMacros } from "../nutrition/validation.js";
import { constraintsFromProfile, toFoodData } from "./foods.js";

export class NutritionPlanError extends Error {
  constructor(
    public readonly code: "PROFILE_INCOMPLETE" | "GENERATION_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "NutritionPlanError";
  }
}

const planInclude = {
  target: true,
  meals: {
    orderBy: { order: "asc" as const },
    include: {
      items: {
        orderBy: { order: "asc" as const },
        include: { food: true },
      },
    },
  },
} as const;

export async function getActiveNutritionPlan(userId: string) {
  return prisma.nutritionPlan.findFirst({
    where: { userId, status: NutritionPlanStatus.ACTIVE },
    include: planInclude,
    orderBy: { startedAt: "desc" },
  });
}

export async function getNutritionTargets(userId: string) {
  const plan = await prisma.nutritionPlan.findFirst({
    where: { userId, status: NutritionPlanStatus.ACTIVE },
    include: { target: true },
    orderBy: { startedAt: "desc" },
  });
  return plan?.target ?? null;
}

export async function getMealPlanSummary(userId: string) {
  const plan = await getActiveNutritionPlan(userId);
  if (!plan) return null;
  return {
    calories: plan.target.calories,
    proteinGrams: plan.target.proteinGrams,
    carbsGrams: plan.target.carbsGrams,
    fatGrams: plan.target.fatGrams,
    meals: plan.meals.map((meal) => ({
      order: meal.order,
      name: meal.name,
      foods: meal.items.map((item) => ({
        name: item.food.name,
        nameAr: item.food.nameAr,
        quantityGrams: item.quantityGrams,
      })),
    })),
  };
}

async function createNutritionPlan(userId: string) {
  const [user, foodRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        gymMemberships: {
          where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.food.findMany({ where: { isActive: true }, orderBy: { slug: "asc" } }),
  ]);
  const profile = user?.profile;
  if (!user || user.onboardingStep !== OnboardingStep.COMPLETE || !profile
    || profile.age === null || !profile.sex || profile.heightCm === null
    || profile.weightKg === null || !profile.activityLevel || !profile.goal
    || profile.mealsPerDay === null || profile.weeklyFoodBudgetIqd === null) {
    throw new NutritionPlanError("PROFILE_INCOMPLETE", "Nutrition profile fields are incomplete");
  }
  const target = calculateNutritionTargets({
    age: profile.age,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
  });
  const goal = profile.goal;
  const foods = foodRows.map(toFoodData);
  for (const food of foods) validateFoodMacros(food);
  const constraints: FoodConstraints = constraintsFromProfile(profile);
  let generated;
  try {
    generated = generateNutritionPlan(target, profile.mealsPerDay, foods, constraints);
  } catch (error) {
    if (error instanceof NutritionGenerationError) {
      throw new NutritionPlanError("GENERATION_FAILED", error.message);
    }
    throw error;
  }
  const gymId = user.gymMemberships[0]?.gymId ?? null;
  const now = new Date();
  const planId = await prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await archiveActiveNutritionPlans(transaction, userId, now);
    const createdTarget = await transaction.nutritionTarget.create({
      data: {
        userId,
        gymId,
        calories: target.targetCalories,
        proteinGrams: target.proteinGrams,
        carbsGrams: target.carbsGrams,
        fatGrams: target.fatGrams,
        estimatedMaintenanceCalories: target.maintenanceCalories,
        goal,
        calculationVersion: target.calculationVersion,
      },
      select: { id: true },
    });
    const created = await transaction.nutritionPlan.create({
      data: {
        userId,
        gymId,
        targetId: createdTarget.id,
        name: generated.name,
        status: NutritionPlanStatus.ACTIVE,
        mealsPerDay: generated.mealsPerDay,
        dailyCalories: Math.round(generated.totals.calories),
        dailyProteinGrams: generated.totals.proteinGrams,
        dailyCarbsGrams: generated.totals.carbsGrams,
        dailyFatGrams: generated.totals.fatGrams,
        estimatedDailyCostIqd: generated.estimatedDailyCostIqd,
        estimatedWeeklyCostIqd: generated.estimatedWeeklyCostIqd,
        startedAt: now,
        meals: {
          create: generated.meals.map((meal) => ({
            order: meal.order,
            mealType: meal.mealType,
            name: meal.name,
            targetCalories: meal.targetCalories,
            items: {
              create: meal.items.map((item, index) => ({
                foodId: item.foodId,
                order: index + 1,
                quantityGrams: item.quantityGrams,
                calories: item.calories,
                proteinGrams: item.proteinGrams,
                carbsGrams: item.carbsGrams,
                fatGrams: item.fatGrams,
                notes: item.notes,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    return created.id;
  });
  const plan = await prisma.nutritionPlan.findUnique({
    where: { id: planId },
    include: planInclude,
  });
  if (!plan) throw new NutritionPlanError("GENERATION_FAILED", "Created nutrition plan is unavailable");
  return { plan, warnings: generated.warnings };
}

export async function generateInitialNutritionPlan(userId: string) {
  return createNutritionPlan(userId);
}

export async function regenerateNutritionPlan(userId: string) {
  return createNutritionPlan(userId);
}
