-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'EVALUATED');

-- CreateEnum
CREATE TYPE "CheckInStep" AS ENUM ('WEIGHT', 'WAIST', 'NUTRITION_ADHERENCE', 'WORKOUTS_COMPLETED', 'STEPS', 'SLEEP', 'HUNGER', 'ENERGY', 'NOTES', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ProgressDecisionAction" AS ENUM ('COLLECT_MORE_DATA', 'KEEP_CURRENT_PLAN', 'DECREASE_CALORIES', 'INCREASE_CALORIES', 'INCREASE_STEPS', 'REVIEW_ADHERENCE', 'COACH_REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "BodyMeasurement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "waistCm" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BodyMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "status" "CheckInStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" "CheckInStep" NOT NULL DEFAULT 'WEIGHT',
    "weightKg" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "nutritionAdherencePct" INTEGER,
    "workoutsCompleted" INTEGER,
    "trackedWorkoutsCompleted" INTEGER,
    "averageDailySteps" INTEGER,
    "averageSleepHours" DOUBLE PRECISION,
    "hungerRating" INTEGER,
    "energyRating" INTEGER,
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEvaluation" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "action" "ProgressDecisionAction" NOT NULL,
    "weightTrendKgPerWeek" DOUBLE PRECISION,
    "weightTrendPercentPerWeek" DOUBLE PRECISION,
    "recommendedCaloriesDelta" INTEGER,
    "recommendedStepsDelta" INTEGER,
    "requiresCoachApproval" BOOLEAN NOT NULL DEFAULT false,
    "reasonCodes" JSONB,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyMeasurement_userId_measuredAt_idx" ON "BodyMeasurement"("userId", "measuredAt");
CREATE INDEX "BodyMeasurement_gymId_measuredAt_idx" ON "BodyMeasurement"("gymId", "measuredAt");

CREATE INDEX "WeeklyCheckIn_userId_status_idx" ON "WeeklyCheckIn"("userId", "status");
CREATE INDEX "WeeklyCheckIn_userId_createdAt_idx" ON "WeeklyCheckIn"("userId", "createdAt");
CREATE INDEX "WeeklyCheckIn_gymId_createdAt_idx" ON "WeeklyCheckIn"("gymId", "createdAt");

CREATE UNIQUE INDEX "ProgressEvaluation_checkInId_key" ON "ProgressEvaluation"("checkInId");
CREATE INDEX "ProgressEvaluation_userId_createdAt_idx" ON "ProgressEvaluation"("userId", "createdAt");
CREATE INDEX "ProgressEvaluation_gymId_createdAt_idx" ON "ProgressEvaluation"("gymId", "createdAt");
CREATE INDEX "ProgressEvaluation_action_createdAt_idx" ON "ProgressEvaluation"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BodyMeasurement" ADD CONSTRAINT "BodyMeasurement_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WeeklyCheckIn" ADD CONSTRAINT "WeeklyCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyCheckIn" ADD CONSTRAINT "WeeklyCheckIn_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgressEvaluation" ADD CONSTRAINT "ProgressEvaluation_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "WeeklyCheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressEvaluation" ADD CONSTRAINT "ProgressEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressEvaluation" ADD CONSTRAINT "ProgressEvaluation_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
