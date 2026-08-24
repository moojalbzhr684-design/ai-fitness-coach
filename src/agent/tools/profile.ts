import { getActiveGymMembership } from "../../auth/permissions.js";
import { GymRole } from "../../generated/prisma/client.js";
import { getMemberTrainer } from "../../services/trainers.js";
import { getUserProfileById } from "../../services/users.js";
import { emptyToolInputSchema } from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

export const profileTools: AgentToolDefinition[] = [
  {
    name: "get_user_profile",
    description: "Read the authenticated user's structured fitness profile. Never accepts a user ID.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => getUserProfileById(actor.userId),
  },
  {
    name: "get_active_gym_context",
    description: "Read the authenticated user's selected active gym context and safe AI branding/settings.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    requiresGym: true,
    handler: async (_input, { actor }) => {
      const membership = await getActiveGymMembership(actor.userId, actor.gymId!);
      if (!membership) return { status: "not_found" };
      return {
        status: "found",
        gym: {
          name: membership.gym.settings?.displayName ?? membership.gym.name,
          aiDisplayName: membership.gym.settings?.aiDisplayName ?? membership.gym.aiName,
          defaultLanguage: membership.gym.settings?.defaultLanguage ?? membership.gym.aiLanguage,
          trainingPhilosophy: membership.gym.settings?.trainingPhilosophy ?? null,
        },
        role: membership.role,
      };
    },
  },
  {
    name: "get_assigned_trainer",
    description: "Read the authenticated member's assigned primary trainer in the active gym.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    requiresGym: true,
    allowedGymRoles: [GymRole.MEMBER],
    handler: async (_input, { actor }) => {
      const assignment = await getMemberTrainer(actor.userId, actor.gymId!);
      if (!assignment) return { status: "not_assigned" };
      return {
        status: "assigned",
        trainer: {
          displayName: assignment.trainer.trainerProfile?.displayName ?? assignment.trainer.firstName ?? "المدرب",
          username: assignment.trainer.telegramUsername,
          bio: assignment.trainer.trainerProfile?.bio ?? null,
          specialties: assignment.trainer.trainerProfile?.specialties ?? null,
        },
      };
    },
  },
];
