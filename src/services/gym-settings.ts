import { z } from "zod";
import { MembershipStatus, Prisma } from "../generated/prisma/client.js";
import { canManageGym } from "../auth/permissions.js";
import { prisma } from "../lib/prisma.js";

const color = z.string().trim().regex(/^#[0-9A-F]{6}$/i).nullable();
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable();

export const gymSettingsInputSchema = z.object({
  displayName: optionalText(120).optional(),
  aiDisplayName: optionalText(120).optional(),
  primaryColor: color.optional(),
  secondaryColor: color.optional(),
  logoMediaId: z.string().trim().min(1).nullable().optional(),
  defaultLanguage: z.string().trim().min(2).max(20).optional(),
  requireTrainerApprovalForNutritionChanges: z.boolean().optional(),
  requireTrainerApprovalForWorkoutChanges: z.boolean().optional(),
  allowAutomaticProgressRecommendations: z.boolean().optional(),
  trainingPhilosophy: optionalText(2_000).optional(),
  defaultSessionMinutes: z.number().int().min(20).max(180).nullable().optional(),
  preferredSplitConfig: z.unknown().nullable().optional(),
  allowedEquipment: z.unknown().nullable().optional(),
  welcomeMessage: optionalText(1_000).optional(),
}).strict();

export type GymSettingsInput = z.infer<typeof gymSettingsInputSchema>;

export class GymSettingsError extends Error {
  constructor(
    public readonly code: "FORBIDDEN" | "INVALID_SETTINGS" | "GYM_NOT_FOUND" | "INVALID_LOGO",
    message: string,
  ) {
    super(message);
    this.name = "GymSettingsError";
  }
}

export async function getGymSettings(gymId: string) {
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    include: { settings: true },
  });
  if (!gym) return null;
  return { gym, settings: gym.settings };
}

export async function updateGymSettings(
  actorUserId: string,
  gymId: string,
  input: GymSettingsInput,
) {
  if (!await canManageGym(actorUserId, gymId)) {
    throw new GymSettingsError("FORBIDDEN", "Only a same-gym owner or super admin can update settings");
  }
  const parsed = gymSettingsInputSchema.safeParse(input);
  if (!parsed.success) throw new GymSettingsError("INVALID_SETTINGS", parsed.error.message);
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) throw new GymSettingsError("GYM_NOT_FOUND", "Gym not found");
  if (parsed.data.logoMediaId) {
    const logo = await prisma.media.findFirst({
      where: { id: parsed.data.logoMediaId, gymId },
      select: { id: true },
    });
    if (!logo) throw new GymSettingsError("INVALID_LOGO", "Logo media is outside the gym scope");
  }
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  ) as Prisma.GymSettingsUncheckedUpdateInput;
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const settings = await transaction.gymSettings.upsert({
      where: { gymId },
      update: data,
      create: { gymId, ...data } as Prisma.GymSettingsUncheckedCreateInput,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        gymId,
        action: "GYM_SETTINGS_UPDATED",
        targetType: "GymSettings",
        targetId: settings.id,
        metadata: { changedFields: Object.keys(parsed.data) },
      },
    });
    return settings;
  });
}

export async function getEffectiveGymBranding(userId: string) {
  const memberships = await prisma.gymMembership.findMany({
    where: { userId, status: MembershipStatus.ACTIVE, gym: { isActive: true } },
    include: { gym: { include: { settings: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length !== 1) {
    return {
      ambiguous: memberships.length > 1,
      gyms: memberships.map(({ id, gym }) => ({ membershipId: id, gymId: gym.id, name: gym.settings?.displayName ?? gym.name })),
      branding: null,
    };
  }
  const gym = memberships[0]!.gym;
  return {
    ambiguous: false,
    gyms: [{ membershipId: memberships[0]!.id, gymId: gym.id, name: gym.settings?.displayName ?? gym.name }],
    branding: {
      gymId: gym.id,
      displayName: gym.settings?.displayName ?? gym.name,
      aiDisplayName: gym.settings?.aiDisplayName ?? gym.aiName,
      primaryColor: gym.settings?.primaryColor ?? gym.primaryColor,
      secondaryColor: gym.settings?.secondaryColor ?? gym.secondaryColor,
      defaultLanguage: gym.settings?.defaultLanguage ?? gym.aiLanguage,
      welcomeMessage: gym.settings?.welcomeMessage ?? null,
    },
  };
}
