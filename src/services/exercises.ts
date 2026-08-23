import type { EquipmentType, MovementPattern, MuscleGroup } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export async function listActiveExercises(filters: {
  primaryMuscle?: MuscleGroup;
  movementPattern?: MovementPattern;
  equipment?: EquipmentType[];
} = {}) {
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      ...(filters.primaryMuscle ? { primaryMuscle: filters.primaryMuscle } : {}),
      ...(filters.movementPattern ? { movementPattern: filters.movementPattern } : {}),
      ...(filters.equipment?.length ? { equipment: { in: filters.equipment } } : {}),
    },
    orderBy: [{ primaryMuscle: "asc" }, { name: "asc" }],
  });
}

export async function getExerciseSubstitutions(
  exerciseId: string,
  availableEquipment?: EquipmentType[],
) {
  const source = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!source) return [];

  const substitutions = await prisma.exerciseSubstitution.findMany({
    where: {
      exerciseId,
      substituteExercise: {
        isActive: true,
        ...(availableEquipment?.length ? { equipment: { in: availableEquipment } } : {}),
      },
    },
    include: { substituteExercise: true },
    orderBy: [{ priority: "asc" }, { substituteExercise: { name: "asc" } }],
  });
  return substitutions.sort((left, right) => {
    const leftSimilarity = Number(left.substituteExercise.primaryMuscle !== source.primaryMuscle)
      + Number(left.substituteExercise.movementPattern !== source.movementPattern);
    const rightSimilarity = Number(right.substituteExercise.primaryMuscle !== source.primaryMuscle)
      + Number(right.substituteExercise.movementPattern !== source.movementPattern);
    return leftSimilarity - rightSimilarity || left.priority - right.priority;
  });
}
