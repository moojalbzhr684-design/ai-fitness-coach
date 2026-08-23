import { EquipmentType, MuscleGroup } from "../generated/prisma/client.js";
import type {
  ProgressionPrescription,
  ProgressionRecommendation,
  ProgressionSet,
} from "./types.js";

const lowerBodyMuscles = new Set<MuscleGroup>([
  MuscleGroup.QUADS,
  MuscleGroup.HAMSTRINGS,
  MuscleGroup.GLUTES,
  MuscleGroup.CALVES,
]);

function mostRecentWeight(sets: ProgressionSet[]): number | null {
  for (let index = sets.length - 1; index >= 0; index -= 1) {
    const weight = sets[index]?.weightKg;
    if (weight !== null && weight !== undefined) return weight;
  }
  return null;
}

export function recommendDoubleProgression(
  prescription: ProgressionPrescription,
  loggedSets: ProgressionSet[],
): ProgressionRecommendation {
  const workingSets = loggedSets.filter((set) => !set.isWarmup);
  const currentWeightKg = mostRecentWeight(workingSets);

  if (workingSets.length < prescription.sets) {
    return {
      action: "REPEAT_SESSION",
      currentWeightKg,
      recommendedWeightKg: currentWeightKg,
      reason: "البيانات مو مكتملة؛ كرر نفس الوزن وسجّل كل المجموعات.",
    };
  }

  const prescribedSets = workingSets.slice(0, prescription.sets);
  const belowRange = prescribedSets.filter((set) => set.reps < prescription.repMin).length;
  if (belowRange >= Math.ceil(prescription.sets / 2)) {
    const decrease = lowerBodyMuscles.has(prescription.primaryMuscle) ? 5 : 2.5;
    return {
      action: "DECREASE_WEIGHT",
      currentWeightKg,
      recommendedWeightKg: currentWeightKg === null ? null : Math.max(0, currentWeightKg - decrease),
      reason: "عدة مجموعات نزلت عن نطاق العدات؛ خفف الوزن بشكل بسيط.",
    };
  }

  const reachedTop = prescribedSets.every((set) => set.reps >= prescription.repMax);
  const rirAcceptable = prescription.rirTarget === null || prescribedSets.every(
    (set) => set.rir === null || set.rir >= prescription.rirTarget!,
  );
  if (reachedTop && rirAcceptable) {
    const fixedIncrement = new Set<EquipmentType>([
      EquipmentType.BARBELL,
      EquipmentType.EZ_BAR,
    ]).has(prescription.equipment);
    const increment = lowerBodyMuscles.has(prescription.primaryMuscle) ? 5 : 2.5;
    return {
      action: "INCREASE_WEIGHT",
      currentWeightKg,
      recommendedWeightKg: fixedIncrement && currentWeightKg !== null
        ? currentWeightKg + increment
        : null,
      reason: fixedIncrement
        ? "وصلت أعلى نطاق العدات بكل المجموعات؛ زيد الوزن بالمرة الجاية."
        : "وصلت أعلى نطاق العدات؛ استخدم أصغر زيادة متوفرة بالمرة الجاية.",
    };
  }

  return {
    action: "KEEP_WEIGHT",
    currentWeightKg,
    recommendedWeightKg: currentWeightKg,
    reason: reachedTop
      ? "ثبت الوزن حتى تحقق العدات مع RIR مناسب."
      : "خليك على نفس الوزن وحاول توصل أعلى نطاق العدات.",
  };
}
