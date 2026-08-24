-- AlterEnum
ALTER TYPE "AIEventStatus" ADD VALUE 'PROCESSING' BEFORE 'SUCCESS';

-- CreateEnum
CREATE TYPE "AgentMemoryCategory" AS ENUM (
  'FOOD_PREFERENCE',
  'FOOD_DISLIKE',
  'TRAINING_PREFERENCE',
  'SCHEDULE_PREFERENCE',
  'EXERCISE_PREFERENCE',
  'COACHING_PREFERENCE',
  'USER_STATED_CONSTRAINT'
);

-- CreateEnum
CREATE TYPE "AIToolExecutionStatus" AS ENUM ('SUCCESS', 'ERROR', 'TIMEOUT', 'REJECTED');

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "category" "AgentMemoryCategory" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastConfirmedAt" TIMESTAMP(3),

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIToolExecution" (
    "id" TEXT NOT NULL,
    "aiEventId" TEXT,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "toolName" TEXT NOT NULL,
    "status" "AIToolExecutionStatus" NOT NULL,
    "durationMs" INTEGER,
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_userId_category_key_key" ON "AgentMemory"("userId", "category", "key");
CREATE INDEX "AgentMemory_userId_isActive_updatedAt_idx" ON "AgentMemory"("userId", "isActive", "updatedAt");
CREATE INDEX "AgentMemory_gymId_isActive_idx" ON "AgentMemory"("gymId", "isActive");
CREATE INDEX "AIToolExecution_aiEventId_createdAt_idx" ON "AIToolExecution"("aiEventId", "createdAt");
CREATE INDEX "AIToolExecution_userId_createdAt_idx" ON "AIToolExecution"("userId", "createdAt");
CREATE INDEX "AIToolExecution_gymId_createdAt_idx" ON "AIToolExecution"("gymId", "createdAt");
CREATE INDEX "AIToolExecution_toolName_status_createdAt_idx" ON "AIToolExecution"("toolName", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIToolExecution" ADD CONSTRAINT "AIToolExecution_aiEventId_fkey" FOREIGN KEY ("aiEventId") REFERENCES "AIEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIToolExecution" ADD CONSTRAINT "AIToolExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIToolExecution" ADD CONSTRAINT "AIToolExecution_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
