import { describe, expect, it } from "vitest";
import { ProgressDecisionAction } from "../../generated/prisma/client.js";
import { deriveMemberAttentionSignals } from "./attention.js";

const now = new Date("2026-08-24T12:00:00Z");

describe("member attention signals", () => {
  it("returns structured, non-diagnostic operational signals", () => {
    const signals = deriveMemberAttentionSignals({
      now,
      lastCheckInAt: new Date("2026-08-10T12:00:00Z"),
      nutritionAdherencePct: 62,
      lastWorkoutAt: null,
      hasPendingApproval: true,
      hungerRating: 9,
      energyRating: 2,
      averageSleepHours: 4.5,
      latestAction: ProgressDecisionAction.COACH_REVIEW_REQUIRED,
      reasonCodes: ["STABLE_WEIGHT"],
    });
    expect(signals.map(({ type }) => type)).toEqual(expect.arrayContaining(["CHECKIN_OVERDUE", "LOW_NUTRITION_ADHERENCE", "WORKOUT_INACTIVITY", "PENDING_COACH_REVIEW", "RECOVERY_WARNING", "STALLED_PROGRESS"]));
    expect(signals.every((signal) => !/diagnos|disease|medical/i.test(signal.message))).toBe(true);
  });

  it("returns no warnings for recent healthy activity without pending review", () => {
    expect(deriveMemberAttentionSignals({ now, lastCheckInAt: now, nutritionAdherencePct: 90, lastWorkoutAt: now, hasPendingApproval: false, hungerRating: 4, energyRating: 7, averageSleepHours: 8, latestAction: null, reasonCodes: [] })).toEqual([]);
  });
});
