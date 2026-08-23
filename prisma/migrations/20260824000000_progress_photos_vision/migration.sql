-- CreateEnum
CREATE TYPE "PhotoView" AS ENUM ('FRONT', 'SIDE', 'BACK', 'OTHER');

-- CreateEnum
CREATE TYPE "PhotoAnalysisStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PRIVATE', 'TRAINER_ALLOWED', 'GYM_ALLOWED');

-- AlterTable
ALTER TABLE "UserProfile"
ADD COLUMN "allowVisionAnalysis" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowTrainerPhotoAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowGymPhotoAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Media"
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

-- CreateTable
CREATE TABLE "ProgressPhotoSet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "waistCm" DOUBLE PRECISION,
    "notes" TEXT,
    "analysisRequested" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressPhotoSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressPhoto" (
    "id" TEXT NOT NULL,
    "photoSetId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "view" "PhotoView" NOT NULL,
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressPhotoAnalysis" (
    "id" TEXT NOT NULL,
    "photoSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "status" "PhotoAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "model" TEXT,
    "overallSummary" TEXT,
    "frontSummary" TEXT,
    "sideSummary" TEXT,
    "backSummary" TEXT,
    "symmetryNotes" TEXT,
    "postureNotes" TEXT,
    "muscularityNotes" TEXT,
    "leannessNotes" TEXT,
    "comparisonSummary" TEXT,
    "confidenceLabel" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressPhotoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressPhotoSet_userId_capturedAt_idx" ON "ProgressPhotoSet"("userId", "capturedAt");
CREATE INDEX "ProgressPhotoSet_userId_completedAt_idx" ON "ProgressPhotoSet"("userId", "completedAt");
CREATE INDEX "ProgressPhotoSet_gymId_capturedAt_idx" ON "ProgressPhotoSet"("gymId", "capturedAt");

CREATE UNIQUE INDEX "ProgressPhoto_mediaId_key" ON "ProgressPhoto"("mediaId");
CREATE UNIQUE INDEX "ProgressPhoto_photoSetId_view_key" ON "ProgressPhoto"("photoSetId", "view");
CREATE INDEX "ProgressPhoto_photoSetId_idx" ON "ProgressPhoto"("photoSetId");
CREATE INDEX "ProgressPhoto_visibility_idx" ON "ProgressPhoto"("visibility");

CREATE UNIQUE INDEX "ProgressPhotoAnalysis_photoSetId_key" ON "ProgressPhotoAnalysis"("photoSetId");
CREATE INDEX "ProgressPhotoAnalysis_userId_createdAt_idx" ON "ProgressPhotoAnalysis"("userId", "createdAt");
CREATE INDEX "ProgressPhotoAnalysis_gymId_createdAt_idx" ON "ProgressPhotoAnalysis"("gymId", "createdAt");
CREATE INDEX "ProgressPhotoAnalysis_status_createdAt_idx" ON "ProgressPhotoAnalysis"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProgressPhotoSet" ADD CONSTRAINT "ProgressPhotoSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressPhotoSet" ADD CONSTRAINT "ProgressPhotoSet_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_photoSetId_fkey" FOREIGN KEY ("photoSetId") REFERENCES "ProgressPhotoSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressPhoto" ADD CONSTRAINT "ProgressPhoto_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressPhotoAnalysis" ADD CONSTRAINT "ProgressPhotoAnalysis_photoSetId_fkey" FOREIGN KEY ("photoSetId") REFERENCES "ProgressPhotoSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressPhotoAnalysis" ADD CONSTRAINT "ProgressPhotoAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressPhotoAnalysis" ADD CONSTRAINT "ProgressPhotoAnalysis_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
