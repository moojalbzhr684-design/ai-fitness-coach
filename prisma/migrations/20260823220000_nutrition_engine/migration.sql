-- CreateEnum
CREATE TYPE "NutritionPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DRAFT');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'PRE_WORKOUT', 'POST_WORKOUT', 'OTHER');

-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('PROTEIN', 'CARBOHYDRATE', 'FAT', 'VEGETABLE', 'FRUIT', 'DAIRY', 'LEGUME', 'MIXED_MEAL', 'OTHER');

-- CreateEnum
CREATE TYPE "FoodUnit" AS ENUM ('GRAM', 'MILLILITER', 'PIECE');

-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('HALAL', 'VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'DAIRY_FREE', 'OTHER');

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "slug" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL,
    "caloriesPer100g" DOUBLE PRECISION NOT NULL,
    "proteinPer100g" DOUBLE PRECISION NOT NULL,
    "carbsPer100g" DOUBLE PRECISION NOT NULL,
    "fatPer100g" DOUBLE PRECISION NOT NULL,
    "fiberPer100g" DOUBLE PRECISION,
    "defaultUnit" "FoodUnit" NOT NULL DEFAULT 'GRAM',
    "defaultServingGrams" DOUBLE PRECISION,
    "estimatedPriceIqdPerKg" DOUBLE PRECISION,
    "dietaryTags" JSONB,
    "allergenTags" JSONB,
    "isIraqiCommon" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodSubstitution" (
    "id" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "substituteFoodId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "calories" INTEGER NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "carbsGrams" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "estimatedMaintenanceCalories" INTEGER,
    "goal" "Goal" NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "targetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "NutritionPlanStatus" NOT NULL,
    "mealsPerDay" INTEGER NOT NULL,
    "dailyCalories" INTEGER NOT NULL,
    "dailyProteinGrams" DOUBLE PRECISION NOT NULL,
    "dailyCarbsGrams" DOUBLE PRECISION NOT NULL,
    "dailyFatGrams" DOUBLE PRECISION NOT NULL,
    "estimatedDailyCostIqd" INTEGER,
    "estimatedWeeklyCostIqd" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "nutritionPlanId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "mealType" "MealType" NOT NULL,
    "name" TEXT NOT NULL,
    "targetCalories" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "quantityGrams" DOUBLE PRECISION NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL,
    "proteinGrams" DOUBLE PRECISION NOT NULL,
    "carbsGrams" DOUBLE PRECISION NOT NULL,
    "fatGrams" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Food_slug_key" ON "Food"("slug");
CREATE INDEX "Food_category_idx" ON "Food"("category");
CREATE INDEX "Food_isIraqiCommon_idx" ON "Food"("isIraqiCommon");
CREATE INDEX "Food_isActive_idx" ON "Food"("isActive");
CREATE INDEX "Food_category_isActive_idx" ON "Food"("category", "isActive");

CREATE INDEX "FoodSubstitution_foodId_priority_idx" ON "FoodSubstitution"("foodId", "priority");
CREATE INDEX "FoodSubstitution_substituteFoodId_idx" ON "FoodSubstitution"("substituteFoodId");
CREATE UNIQUE INDEX "FoodSubstitution_foodId_substituteFoodId_key" ON "FoodSubstitution"("foodId", "substituteFoodId");

CREATE INDEX "NutritionTarget_userId_createdAt_idx" ON "NutritionTarget"("userId", "createdAt");
CREATE INDEX "NutritionTarget_gymId_createdAt_idx" ON "NutritionTarget"("gymId", "createdAt");
CREATE INDEX "NutritionTarget_goal_calculationVersion_idx" ON "NutritionTarget"("goal", "calculationVersion");

CREATE INDEX "NutritionPlan_userId_status_idx" ON "NutritionPlan"("userId", "status");
CREATE INDEX "NutritionPlan_gymId_status_idx" ON "NutritionPlan"("gymId", "status");
CREATE INDEX "NutritionPlan_targetId_idx" ON "NutritionPlan"("targetId");
CREATE INDEX "NutritionPlan_userId_startedAt_idx" ON "NutritionPlan"("userId", "startedAt");

CREATE INDEX "Meal_nutritionPlanId_idx" ON "Meal"("nutritionPlanId");
CREATE UNIQUE INDEX "Meal_nutritionPlanId_order_key" ON "Meal"("nutritionPlanId", "order");

CREATE INDEX "MealItem_mealId_idx" ON "MealItem"("mealId");
CREATE INDEX "MealItem_foodId_idx" ON "MealItem"("foodId");
CREATE UNIQUE INDEX "MealItem_mealId_order_key" ON "MealItem"("mealId", "order");

-- AddForeignKey
ALTER TABLE "FoodSubstitution" ADD CONSTRAINT "FoodSubstitution_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FoodSubstitution" ADD CONSTRAINT "FoodSubstitution_substituteFoodId_fkey" FOREIGN KEY ("substituteFoodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "NutritionTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_nutritionPlanId_fkey" FOREIGN KEY ("nutritionPlanId") REFERENCES "NutritionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
