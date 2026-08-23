import { EquipmentType } from "../generated/prisma/client.js";
import { canManageGym } from "../auth/permissions.js";
import { prisma } from "../lib/prisma.js";
import type { WorkoutGenerationPreferences } from "../workout/types.js";

export class GymExerciseError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "EXERCISE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "GymExerciseError";
  }
}

function stringSet(value: unknown): Set<string> | undefined {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string");
    return new Set(strings);
  }
  if (value && typeof value === "object" && "preferredSlugs" in value) {
    return stringSet((value as { preferredSlugs?: unknown }).preferredSlugs);
  }
  return undefined;
}

function equipmentSet(value: unknown): Set<EquipmentType> | undefined {
  const values = stringSet(value);
  if (!values) return undefined;
  const valid = new Set(Object.values(EquipmentType));
  return new Set([...values].filter((item): item is EquipmentType => valid.has(item as EquipmentType)));
}

function repRange(value: unknown): { min: number; max: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { min, max } = value as { min?: unknown; max?: unknown };
  if (!Number.isInteger(min) || !Number.isInteger(max)) return undefined;
  const normalizedMin = Math.max(1, Math.min(30, min as number));
  const normalizedMax = Math.max(normalizedMin, Math.min(30, max as number));
  return { min: normalizedMin, max: normalizedMax };
}

export async function setGymExerciseAvailability(
  actorUserId: string,
  gymId: string,
  exerciseId: string,
  isAvailable: boolean,
  notes?: string | null,
) {
  if (!await canManageGym(actorUserId, gymId)) {
    throw new GymExerciseError("FORBIDDEN", "Only a same-gym owner or super admin can change exercise availability");
  }
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { id: true } });
  if (!exercise) throw new GymExerciseError("EXERCISE_NOT_FOUND", "Exercise not found");
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const availability = await transaction.gymExerciseAvailability.upsert({
      where: { gymId_exerciseId: { gymId, exerciseId } },
      update: { isAvailable, notes: notes ?? null },
      create: { gymId, exerciseId, isAvailable, notes: notes ?? null },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        gymId,
        action: "GYM_EXERCISE_AVAILABILITY_CHANGED",
        targetType: "Exercise",
        targetId: exerciseId,
        metadata: { isAvailable },
      },
    });
    return availability;
  });
}

export async function getGymWorkoutPreferences(
  gymId: string,
  memberUserId: string,
): Promise<WorkoutGenerationPreferences> {
  const [settings, availability, assignment, substitutions] = await Promise.all([
    prisma.gymSettings.findUnique({ where: { gymId } }),
    prisma.gymExerciseAvailability.findMany({
      where: { gymId },
      include: { exercise: { select: { slug: true } } },
    }),
    prisma.trainerAssignment.findFirst({
      where: { gymId, memberUserId, isPrimary: true },
      include: { trainer: { include: { trainerPreferences: { where: { gymId } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.exerciseSubstitution.findMany({
      orderBy: [{ exerciseId: "asc" }, { priority: "asc" }],
      include: {
        exercise: { select: { slug: true } },
        substituteExercise: { select: { slug: true } },
      },
    }),
  ]);
  const trainerPreferences = assignment?.trainer.trainerPreferences[0];
  const allowedEquipment = equipmentSet(settings?.allowedEquipment);
  const preferredSlugs = stringSet(trainerPreferences?.exercisePreferences);
  const preferredRepRange = repRange(trainerPreferences?.preferredRepRanges);
  const substitutionMap = new Map<string, string[]>();
  for (const item of substitutions) {
    const entries = substitutionMap.get(item.exercise.slug) ?? [];
    entries.push(item.substituteExercise.slug);
    substitutionMap.set(item.exercise.slug, entries);
  }
  return {
    unavailableSlugs: new Set(availability.filter((item) => !item.isAvailable).map((item) => item.exercise.slug)),
    explicitlyAvailableSlugs: new Set(availability.filter((item) => item.isAvailable).map((item) => item.exercise.slug)),
    ...(allowedEquipment ? { allowedEquipment } : {}),
    ...(preferredSlugs ? { preferredSlugs } : {}),
    ...(preferredRepRange ? { preferredRepRange } : {}),
    substitutions: substitutionMap,
    preferredWorkoutStyle: trainerPreferences?.preferredWorkoutStyle ?? null,
  };
}
