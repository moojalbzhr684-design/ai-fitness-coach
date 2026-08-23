import { MembershipStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export const CORE_COACH_SAFETY_RULES = Object.freeze([
  "No medical diagnosis or medication advice",
  "No unsafe starvation, dehydration, or extreme training guidance",
  "No automatic plan mutation outside validated services and approvals",
  "No exact body-fat or muscle-mass claims from photos",
  "No identity or sensitive-trait inference",
]);

export class CoachConfigurationError extends Error {
  constructor(
    public readonly code: "USER_NOT_FOUND" | "GYM_SELECTION_REQUIRED" | "INVALID_GYM",
    message: string,
  ) {
    super(message);
    this.name = "CoachConfigurationError";
  }
}

export async function getEffectiveCoachConfiguration(userId: string, requestedGymId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      gymMemberships: {
        where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
        include: { gym: { include: { settings: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) throw new CoachConfigurationError("USER_NOT_FOUND", "User not found");
  if (!requestedGymId && user.gymMemberships.length > 1) {
    throw new CoachConfigurationError("GYM_SELECTION_REQUIRED", "Select a gym before using tenant-specific coaching");
  }
  const membership = requestedGymId
    ? user.gymMemberships.find((item) => item.gymId === requestedGymId)
    : user.gymMemberships[0];
  if (requestedGymId && !membership) {
    throw new CoachConfigurationError("INVALID_GYM", "Selected gym is outside the user's active scope");
  }
  const gym = membership?.gym ?? null;
  const assignment = gym
    ? await prisma.trainerAssignment.findFirst({
        where: { gymId: gym.id, memberUserId: userId, isPrimary: true },
        include: { trainer: { include: { trainerPreferences: { where: { gymId: gym.id } } } } },
        orderBy: { createdAt: "asc" },
      })
    : null;
  return {
    coreSafetyRules: CORE_COACH_SAFETY_RULES,
    gymId: gym?.id ?? null,
    gym: gym ? {
      displayName: gym.settings?.displayName ?? gym.name,
      coachName: gym.settings?.aiDisplayName ?? gym.aiName,
      language: gym.settings?.defaultLanguage ?? gym.aiLanguage,
      trainingPhilosophy: gym.settings?.trainingPhilosophy ?? null,
      defaultSessionMinutes: gym.settings?.defaultSessionMinutes ?? null,
      preferredSplitConfig: gym.settings?.preferredSplitConfig ?? null,
      allowedEquipment: gym.settings?.allowedEquipment ?? null,
      approvalPolicy: {
        nutrition: gym.settings?.requireTrainerApprovalForNutritionChanges ?? true,
        workout: gym.settings?.requireTrainerApprovalForWorkoutChanges ?? true,
        automaticProgressRecommendations: gym.settings?.allowAutomaticProgressRecommendations ?? true,
      },
    } : null,
    trainer: assignment ? {
      userId: assignment.trainerUserId,
      preferences: assignment.trainer.trainerPreferences[0] ?? null,
    } : null,
    userProfile: user.profile,
  };
}
