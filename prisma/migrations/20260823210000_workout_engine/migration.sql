-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'QUADS', 'HAMSTRINGS', 'GLUTES', 'CALVES', 'ABS', 'FOREARMS', 'FULL_BODY');

-- CreateEnum
CREATE TYPE "ExerciseType" AS ENUM ('COMPOUND', 'ISOLATION');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('BARBELL', 'DUMBBELL', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'SMITH_MACHINE', 'EZ_BAR', 'KETTLEBELL', 'OTHER');

-- CreateEnum
CREATE TYPE "MovementPattern" AS ENUM ('HORIZONTAL_PUSH', 'VERTICAL_PUSH', 'HORIZONTAL_PULL', 'VERTICAL_PULL', 'SQUAT', 'HINGE', 'LUNGE', 'ELBOW_FLEXION', 'ELBOW_EXTENSION', 'SHOULDER_ABDUCTION', 'CALF_RAISE', 'CORE', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkoutSplit" AS ENUM ('FULL_BODY', 'UPPER_LOWER', 'PUSH_PULL_LEGS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WorkoutProgramStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DRAFT');

-- CreateEnum
CREATE TYPE "WorkoutSessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "primaryMuscle" "MuscleGroup" NOT NULL,
    "secondaryMuscles" JSONB,
    "exerciseType" "ExerciseType" NOT NULL,
    "equipment" "EquipmentType" NOT NULL,
    "movementPattern" "MovementPattern" NOT NULL,
    "difficulty" "ExperienceLevel" NOT NULL,
    "instructions" TEXT,
    "videoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSubstitution" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "substituteExerciseId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,

    CONSTRAINT "ExerciseSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "name" TEXT NOT NULL,
    "split" "WorkoutSplit" NOT NULL,
    "status" "WorkoutProgramStatus" NOT NULL,
    "trainingDaysPerWeek" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutDay" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutDayExercise" (
    "id" TEXT NOT NULL,
    "workoutDayId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "repMin" INTEGER NOT NULL,
    "repMax" INTEGER NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "rirTarget" INTEGER,
    "startingWeightKg" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutDayExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "programId" TEXT,
    "workoutDayId" TEXT,
    "status" "WorkoutSessionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "userNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL,
    "workoutSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetLog" (
    "id" TEXT NOT NULL,
    "exerciseLogId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "reps" INTEGER NOT NULL,
    "rir" INTEGER,
    "isWarmup" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");
CREATE INDEX "Exercise_primaryMuscle_isActive_idx" ON "Exercise"("primaryMuscle", "isActive");
CREATE INDEX "Exercise_movementPattern_equipment_isActive_idx" ON "Exercise"("movementPattern", "equipment", "isActive");
CREATE INDEX "Exercise_difficulty_isActive_idx" ON "Exercise"("difficulty", "isActive");

CREATE INDEX "ExerciseSubstitution_exerciseId_priority_idx" ON "ExerciseSubstitution"("exerciseId", "priority");
CREATE INDEX "ExerciseSubstitution_substituteExerciseId_idx" ON "ExerciseSubstitution"("substituteExerciseId");
CREATE UNIQUE INDEX "ExerciseSubstitution_exerciseId_substituteExerciseId_key" ON "ExerciseSubstitution"("exerciseId", "substituteExerciseId");

CREATE INDEX "WorkoutProgram_userId_status_idx" ON "WorkoutProgram"("userId", "status");
CREATE INDEX "WorkoutProgram_gymId_status_idx" ON "WorkoutProgram"("gymId", "status");
CREATE INDEX "WorkoutProgram_userId_startedAt_idx" ON "WorkoutProgram"("userId", "startedAt");

CREATE INDEX "WorkoutDay_programId_idx" ON "WorkoutDay"("programId");
CREATE UNIQUE INDEX "WorkoutDay_programId_dayNumber_key" ON "WorkoutDay"("programId", "dayNumber");

CREATE INDEX "WorkoutDayExercise_workoutDayId_idx" ON "WorkoutDayExercise"("workoutDayId");
CREATE INDEX "WorkoutDayExercise_exerciseId_idx" ON "WorkoutDayExercise"("exerciseId");
CREATE UNIQUE INDEX "WorkoutDayExercise_workoutDayId_order_key" ON "WorkoutDayExercise"("workoutDayId", "order");

CREATE INDEX "WorkoutSession_userId_status_idx" ON "WorkoutSession"("userId", "status");
CREATE INDEX "WorkoutSession_userId_createdAt_idx" ON "WorkoutSession"("userId", "createdAt");
CREATE INDEX "WorkoutSession_gymId_createdAt_idx" ON "WorkoutSession"("gymId", "createdAt");
CREATE INDEX "WorkoutSession_programId_idx" ON "WorkoutSession"("programId");
CREATE INDEX "WorkoutSession_workoutDayId_idx" ON "WorkoutSession"("workoutDayId");

CREATE INDEX "ExerciseLog_workoutSessionId_idx" ON "ExerciseLog"("workoutSessionId");
CREATE INDEX "ExerciseLog_exerciseId_idx" ON "ExerciseLog"("exerciseId");
CREATE UNIQUE INDEX "ExerciseLog_workoutSessionId_order_key" ON "ExerciseLog"("workoutSessionId", "order");

CREATE INDEX "SetLog_exerciseLogId_completedAt_idx" ON "SetLog"("exerciseLogId", "completedAt");
CREATE UNIQUE INDEX "SetLog_exerciseLogId_setNumber_key" ON "SetLog"("exerciseLogId", "setNumber");

-- AddForeignKey
ALTER TABLE "ExerciseSubstitution" ADD CONSTRAINT "ExerciseSubstitution_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseSubstitution" ADD CONSTRAINT "ExerciseSubstitution_substituteExerciseId_fkey" FOREIGN KEY ("substituteExerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutProgram" ADD CONSTRAINT "WorkoutProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutProgram" ADD CONSTRAINT "WorkoutProgram_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutDay" ADD CONSTRAINT "WorkoutDay_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WorkoutProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutDayExercise" ADD CONSTRAINT "WorkoutDayExercise_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutDayExercise" ADD CONSTRAINT "WorkoutDayExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "WorkoutProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_workoutDayId_fkey" FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_workoutSessionId_fkey" FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_exerciseLogId_fkey" FOREIGN KEY ("exerciseLogId") REFERENCES "ExerciseLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
