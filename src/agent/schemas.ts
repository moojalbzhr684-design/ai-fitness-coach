import { z } from "zod";
import { AgentMemoryCategory } from "../generated/prisma/client.js";

export const emptyToolInputSchema = z.object({}).strict();
export const dayNumberSchema = z.number().int().min(1).max(7);
export const boundedReferenceSchema = z.string().trim().min(1).max(100);
export const workoutDayInputSchema = z.object({ dayNumber: dayNumberSchema }).strict();
export const startWorkoutInputSchema = z.object({ dayNumber: dayNumberSchema.nullable().default(null) }).strict();
export const recentHistoryInputSchema = z.object({ limit: z.number().int().min(1).max(5).default(5) }).strict();
export const exerciseReferenceInputSchema = z.object({ exerciseReference: boundedReferenceSchema }).strict();
export const logWorkoutSetInputSchema = z.object({
  exerciseReference: boundedReferenceSchema,
  setNumber: z.number().int().min(1).max(20),
  weightKg: z.number().finite().min(0).max(1_000),
  reps: z.number().int().min(1).max(100),
  rir: z.number().int().min(0).max(5).nullable().default(null),
}).strict();
export const finishWorkoutInputSchema = z.object({ notes: z.string().trim().min(1).max(500).nullable().default(null) }).strict();
export const foodMacroInputSchema = z.object({
  foodReference: boundedReferenceSchema,
  quantityGrams: z.number().finite().positive().max(2_000),
}).strict();
export const foodSubstitutionInputSchema = z.object({
  mealNumber: z.number().int().min(1).max(12),
  foodNumber: z.number().int().min(1).max(20),
}).strict();
export const recentMeasurementsInputSchema = z.object({ limit: z.number().int().min(1).max(12).default(8) }).strict();
export const reviewRequestInputSchema = z.object({
  scope: z.enum(["NUTRITION", "WORKOUT", "BOTH"]),
  notes: z.string().trim().min(1).max(500).nullable().default(null),
}).strict();
export const rememberPreferenceInputSchema = z.object({
  category: z.enum(AgentMemoryCategory),
  key: z.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}_-]+$/u),
  value: z.string().trim().min(1).max(300),
}).strict();
export const forgetMemoryInputSchema = z.object({ memoryId: z.string().trim().min(1).max(100) }).strict();
