-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('NUTRITION_ADJUSTMENT', 'WORKOUT_ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "GymSettings" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "displayName" TEXT,
    "aiDisplayName" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "logoMediaId" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'ar-IQ',
    "requireTrainerApprovalForNutritionChanges" BOOLEAN NOT NULL DEFAULT true,
    "requireTrainerApprovalForWorkoutChanges" BOOLEAN NOT NULL DEFAULT true,
    "allowAutomaticProgressRecommendations" BOOLEAN NOT NULL DEFAULT true,
    "trainingPhilosophy" TEXT,
    "defaultSessionMinutes" INTEGER,
    "preferredSplitConfig" JSONB,
    "allowedEquipment" JSONB,
    "welcomeMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GymSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "specialties" JSONB,
    "yearsExperience" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAssignment" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerPreferences" (
    "id" TEXT NOT NULL,
    "trainerUserId" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "preferredWorkoutStyle" TEXT,
    "preferredRepRanges" JSONB,
    "exercisePreferences" JSONB,
    "nutritionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "trainerUserId" TEXT,
    "agentDecisionId" TEXT,
    "type" "ApprovalType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedChange" JSONB NOT NULL,
    "currentValue" JSONB,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GymExerciseAvailability" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GymExerciseAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GymSettings_gymId_key" ON "GymSettings"("gymId");
CREATE UNIQUE INDEX "GymSettings_logoMediaId_key" ON "GymSettings"("logoMediaId");
CREATE UNIQUE INDEX "TrainerProfile_userId_key" ON "TrainerProfile"("userId");
CREATE INDEX "TrainerProfile_isActive_idx" ON "TrainerProfile"("isActive");
CREATE UNIQUE INDEX "TrainerAssignment_gymId_trainerUserId_memberUserId_key" ON "TrainerAssignment"("gymId", "trainerUserId", "memberUserId");
CREATE INDEX "TrainerAssignment_gymId_trainerUserId_idx" ON "TrainerAssignment"("gymId", "trainerUserId");
CREATE INDEX "TrainerAssignment_gymId_memberUserId_isPrimary_idx" ON "TrainerAssignment"("gymId", "memberUserId", "isPrimary");
CREATE UNIQUE INDEX "TrainerPreferences_trainerUserId_gymId_key" ON "TrainerPreferences"("trainerUserId", "gymId");
CREATE INDEX "TrainerPreferences_gymId_idx" ON "TrainerPreferences"("gymId");
CREATE UNIQUE INDEX "ApprovalRequest_reference_key" ON "ApprovalRequest"("reference");
CREATE UNIQUE INDEX "ApprovalRequest_agentDecisionId_key" ON "ApprovalRequest"("agentDecisionId");
CREATE INDEX "ApprovalRequest_gymId_status_createdAt_idx" ON "ApprovalRequest"("gymId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_trainerUserId_status_createdAt_idx" ON "ApprovalRequest"("trainerUserId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_memberUserId_status_createdAt_idx" ON "ApprovalRequest"("memberUserId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_expiresAt_status_idx" ON "ApprovalRequest"("expiresAt", "status");
CREATE UNIQUE INDEX "GymExerciseAvailability_gymId_exerciseId_key" ON "GymExerciseAvailability"("gymId", "exerciseId");
CREATE INDEX "GymExerciseAvailability_gymId_isAvailable_idx" ON "GymExerciseAvailability"("gymId", "isAvailable");
CREATE INDEX "GymExerciseAvailability_exerciseId_idx" ON "GymExerciseAvailability"("exerciseId");

-- AddForeignKey
ALTER TABLE "GymSettings" ADD CONSTRAINT "GymSettings_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GymSettings" ADD CONSTRAINT "GymSettings_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerAssignment" ADD CONSTRAINT "TrainerAssignment_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerPreferences" ADD CONSTRAINT "TrainerPreferences_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainerPreferences" ADD CONSTRAINT "TrainerPreferences_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_trainerUserId_fkey" FOREIGN KEY ("trainerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_agentDecisionId_fkey" FOREIGN KEY ("agentDecisionId") REFERENCES "AgentDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GymExerciseAvailability" ADD CONSTRAINT "GymExerciseAvailability_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GymExerciseAvailability" ADD CONSTRAINT "GymExerciseAvailability_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
