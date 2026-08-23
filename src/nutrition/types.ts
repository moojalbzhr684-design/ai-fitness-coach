import type {
  ActivityLevel,
  FoodCategory,
  FoodUnit,
  Goal,
  MealType,
  Sex,
} from "../generated/prisma/client.js";

export interface NutritionCalculationInput {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}
export interface NutritionCalculation {
  bmr: number;
  maintenanceCalories: number;
  targetCalories: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
  calculationVersion: string;
}

export interface FoodData {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  category: FoodCategory;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  defaultUnit: FoodUnit;
  defaultServingGrams: number | null;
  estimatedPriceIqdPerKg: number | null;
  dietaryTags: string[];
  allergenTags: string[];
  isIraqiCommon: boolean;
  isActive: boolean;
}

export interface FoodConstraints {
  preferences: string[];
  dislikedFoods: string[];
  allergies: string[];
  dietaryRestrictions: string[];
  weeklyBudgetIqd: number | null;
}

export interface NutritionSnapshot {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}

export interface GeneratedMealItem extends NutritionSnapshot {
  foodId: string;
  food: FoodData;
  quantityGrams: number;
  notes: string | null;
}

export interface GeneratedMeal {
  order: number;
  mealType: MealType;
  name: string;
  targetCalories: number;
  items: GeneratedMealItem[];
  totals: NutritionSnapshot;
}

export interface GeneratedNutritionPlan {
  name: string;
  mealsPerDay: number;
  meals: GeneratedMeal[];
  totals: NutritionSnapshot;
  estimatedDailyCostIqd: number | null;
  estimatedWeeklyCostIqd: number | null;
  warnings: string[];
}

export interface FoodSubstitutionCandidate extends NutritionSnapshot {
  food: FoodData;
  quantityGrams: number;
  differencePercent: number;
  estimatedCostIqd: number | null;
}
