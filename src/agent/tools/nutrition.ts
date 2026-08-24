import { getFoodMacrosByReference, getMealItemAlternatives } from "../../services/foods.js";
import { getActiveNutritionPlan, getMealPlanSummary, getNutritionTargets } from "../../services/nutrition-plans.js";
import { emptyToolInputSchema, foodMacroInputSchema, foodSubstitutionInputSchema } from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

function foodName(food: { name: string; nameAr: string | null }) {
  return food.nameAr ?? food.name;
}

export const nutritionTools: AgentToolDefinition[] = [
  {
    name: "get_active_nutrition_plan",
    description: "Read the authenticated user's active structured meal plan with actual stored quantities.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const plan = await getActiveNutritionPlan(actor.userId);
      return plan ? {
        status: "found",
        plan: {
          name: plan.name,
          target: {
            calories: plan.target.calories,
            proteinGrams: plan.target.proteinGrams,
            carbsGrams: plan.target.carbsGrams,
            fatGrams: plan.target.fatGrams,
          },
          meals: plan.meals.map((meal) => ({
            mealNumber: meal.order,
            name: meal.name,
            items: meal.items.map((item) => ({
              foodNumber: item.order,
              food: foodName(item.food),
              quantityGrams: item.quantityGrams,
            })),
          })),
        },
      } : { status: "not_found" };
    },
  },
  {
    name: "get_nutrition_targets",
    description: "Read the authenticated user's active daily calorie and macro targets.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const target = await getNutritionTargets(actor.userId);
      return target ? {
        status: "found",
        calories: target.calories,
        proteinGrams: target.proteinGrams,
        carbsGrams: target.carbsGrams,
        fatGrams: target.fatGrams,
        goal: target.goal,
      } : { status: "not_found" };
    },
  },
  {
    name: "get_meal_plan_summary",
    description: "Read a concise numbered summary of the authenticated user's active meal plan.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => ({ status: "ok", summary: await getMealPlanSummary(actor.userId) }),
  },
  {
    name: "get_food_macros",
    description: "Look up approximate calories and macros for a food and gram quantity from the platform food database.",
    category: ToolCategory.READ,
    schema: foodMacroInputSchema,
    handler: async (input) => {
      const parsed = foodMacroInputSchema.parse(input);
      const result = await getFoodMacrosByReference(parsed.foodReference, parsed.quantityGrams);
      if (!result) return { status: "not_found" };
      if (!result.match) return { status: "clarification_required", options: result.options };
      return { status: "found", approximate: true, ...result.match };
    },
  },
  {
    name: "find_food_substitutions",
    description: "Calculate safe food substitutions for a numbered item in the authenticated user's active meal plan. Preserves allergies, restrictions, dislikes, and protein/calorie matching.",
    category: ToolCategory.READ,
    schema: foodSubstitutionInputSchema,
    handler: async (input, { actor }) => {
      const { mealNumber, foodNumber } = foodSubstitutionInputSchema.parse(input);
      const result = await getMealItemAlternatives(actor.userId, mealNumber, foodNumber);
      if (!result) return { status: "not_found" };
      return {
        status: result.alternatives.length ? "found" : "no_safe_alternatives",
        original: { food: foodName(result.item.food), quantityGrams: result.item.quantityGrams },
        approximate: true,
        alternatives: result.alternatives.map((item) => ({
          food: foodName(item.food),
          quantityGrams: item.quantityGrams,
          calories: item.calories,
          proteinGrams: item.proteinGrams,
          carbsGrams: item.carbsGrams,
          fatGrams: item.fatGrams,
        })),
      };
    },
  },
];
