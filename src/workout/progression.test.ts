import { describe, expect, it } from "vitest";
import { EquipmentType, MuscleGroup } from "../generated/prisma/client.js";
import { recommendDoubleProgression } from "./progression.js";

const prescription = {
  sets: 3,
  repMin: 8,
  repMax: 12,
  rirTarget: 2,
  primaryMuscle: MuscleGroup.CHEST,
  equipment: EquipmentType.BARBELL,
};

const set = (reps: number, rir: number | null = 2) => ({
  reps,
  rir,
  weightKg: 60,
  isWarmup: false,
});
describe("double progression", () => {
  it("increases after 3x12 at acceptable RIR", () => {
    const result = recommendDoubleProgression(prescription, [set(12), set(12), set(12)]);
    expect(result.action).toBe("INCREASE_WEIGHT");
    expect(result.recommendedWeightKg).toBe(62.5);
  });

  it("also increases at 3x12 when RIR was not logged", () => {
    const result = recommendDoubleProgression(prescription, [set(12, null), set(12, null), set(12, null)]);
    expect(result.action).toBe("INCREASE_WEIGHT");
  });

  it("keeps weight for 10/10/9", () => {
    expect(recommendDoubleProgression(prescription, [set(10), set(10), set(9)]).action)
      .toBe("KEEP_WEIGHT");
  });

  it("decreases after multiple sets below minimum", () => {
    const result = recommendDoubleProgression(prescription, [set(7), set(6), set(8)]);
    expect(result.action).toBe("DECREASE_WEIGHT");
    expect(result.recommendedWeightKg).toBe(57.5);
  });

  it("repeats incomplete sessions", () => {
    expect(recommendDoubleProgression(prescription, [set(12), set(12)]).action)
      .toBe("REPEAT_SESSION");
  });

  it("ignores warmup sets", () => {
    const warmup = { reps: 5, rir: 5, weightKg: 20, isWarmup: true };
    const result = recommendDoubleProgression(prescription, [warmup, set(12), set(12), set(12)]);
    expect(result.action).toBe("INCREASE_WEIGHT");
  });
});
