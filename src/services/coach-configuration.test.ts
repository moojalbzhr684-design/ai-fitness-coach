import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trainerAssignment: { findFirst: vi.fn() },
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import {
  CoachConfigurationError,
  CORE_COACH_SAFETY_RULES,
  getEffectiveCoachConfiguration,
} from "./coach-configuration.js";

beforeEach(() => vi.clearAllMocks());

function membership(gymId: string, coachName: string) {
  return {
    gymId,
    gym: {
      id: gymId,
      name: `Gym ${gymId}`,
      aiName: "Legacy Coach",
      aiLanguage: "ar-IQ",
      settings: {
        displayName: `Branded ${gymId}`,
        aiDisplayName: coachName,
        defaultLanguage: "ar-IQ",
        trainingPhilosophy: "Technique first",
        defaultSessionMinutes: 60,
        preferredSplitConfig: null,
        allowedEquipment: ["DUMBBELL"],
        requireTrainerApprovalForNutritionChanges: true,
        requireTrainerApprovalForWorkoutChanges: true,
        allowAutomaticProgressRecommendations: true,
      },
    },
  };
}

describe("effective coach configuration", () => {
  it("combines gym identity, assigned trainer preferences, and user profile", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "member-a", profile: { goal: "FAT_LOSS" }, gymMemberships: [membership("gym-a", "Power Coach")] });
    mocks.prisma.trainerAssignment.findFirst.mockResolvedValue({
      trainerUserId: "trainer-a",
      trainer: { trainerPreferences: [{ preferredWorkoutStyle: "upper/lower" }] },
    });
    const result = await getEffectiveCoachConfiguration("member-a");
    expect(result.gym).toEqual(expect.objectContaining({ coachName: "Power Coach", trainingPhilosophy: "Technique first" }));
    expect(result.trainer).toEqual(expect.objectContaining({ userId: "trainer-a" }));
    expect(result.userProfile).toEqual({ goal: "FAT_LOSS" });
  });

  it("keeps immutable platform safety rules above tenant configuration", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "member-a", profile: {}, gymMemberships: [membership("gym-a", "Coach")] });
    mocks.prisma.trainerAssignment.findFirst.mockResolvedValue(null);
    const result = await getEffectiveCoachConfiguration("member-a");
    expect(result.coreSafetyRules).toBe(CORE_COACH_SAFETY_RULES);
    expect(Object.isFrozen(result.coreSafetyRules)).toBe(true);
    expect(result.coreSafetyRules).toContain("No medical diagnosis or medication advice");
  });

  it("requires explicit gym selection for multiple tenants", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "member", profile: {}, gymMemberships: [membership("gym-a", "A"), membership("gym-b", "B")],
    });
    await expect(getEffectiveCoachConfiguration("member")).rejects.toMatchObject({
      code: "GYM_SELECTION_REQUIRED",
    } satisfies Partial<CoachConfigurationError>);
  });

  it("blocks a selected gym outside active membership scope", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "member", profile: {}, gymMemberships: [membership("gym-a", "A")] });
    await expect(getEffectiveCoachConfiguration("member", "gym-b")).rejects.toMatchObject({
      code: "INVALID_GYM",
    } satisfies Partial<CoachConfigurationError>);
  });
});
