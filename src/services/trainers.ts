import { z } from "zod";
import { GymRole, MembershipStatus, Prisma, SystemRole } from "../generated/prisma/client.js";
import { canManageGym } from "../auth/permissions.js";
import { prisma } from "../lib/prisma.js";

export class TrainerServiceError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "INVALID_TRAINER"
      | "INVALID_MEMBER"
      | "DUPLICATE_ASSIGNMENT"
      | "ASSIGNMENT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "TrainerServiceError";
  }
}

async function activeMembership(userId: string, gymId: string) {
  return prisma.gymMembership.findFirst({
    where: { userId, gymId, status: MembershipStatus.ACTIVE },
  });
}

export async function assignTrainerToMember(
  actorUserId: string,
  gymId: string,
  trainerUserId: string,
  memberUserId: string,
) {
  if (!await canManageGym(actorUserId, gymId)) {
    throw new TrainerServiceError("FORBIDDEN", "Only a gym owner or super admin can assign trainers");
  }
  if (trainerUserId === memberUserId) {
    throw new TrainerServiceError("INVALID_MEMBER", "A trainer cannot be assigned to themselves");
  }
  const [trainerMembership, memberMembership, existing] = await Promise.all([
    activeMembership(trainerUserId, gymId),
    activeMembership(memberUserId, gymId),
    prisma.trainerAssignment.findUnique({
      where: { gymId_trainerUserId_memberUserId: { gymId, trainerUserId, memberUserId } },
    }),
  ]);
  if (!trainerMembership || !new Set<GymRole>([GymRole.TRAINER, GymRole.OWNER]).has(trainerMembership.role)) {
    throw new TrainerServiceError("INVALID_TRAINER", "Trainer must have an active trainer or owner membership in this gym");
  }
  if (!memberMembership || memberMembership.role !== GymRole.MEMBER) {
    throw new TrainerServiceError("INVALID_MEMBER", "Member must have an active member membership in this gym");
  }
  if (existing) throw new TrainerServiceError("DUPLICATE_ASSIGNMENT", "Trainer assignment already exists");
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.trainerAssignment.updateMany({
      where: { gymId, memberUserId, isPrimary: true },
      data: { isPrimary: false },
    });
    await transaction.trainerProfile.upsert({
      where: { userId: trainerUserId },
      update: { isActive: true },
      create: { userId: trainerUserId },
    });
    const assignment = await transaction.trainerAssignment.create({
      data: { gymId, trainerUserId, memberUserId, isPrimary: true },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        gymId,
        action: "TRAINER_ASSIGNED",
        targetType: "TrainerAssignment",
        targetId: assignment.id,
        metadata: { trainerUserId, memberUserId, isPrimary: true },
      },
    });
    return assignment;
  });
}

export async function removeTrainerFromMember(
  actorUserId: string,
  gymId: string,
  trainerUserId: string,
  memberUserId: string,
) {
  if (!await canManageGym(actorUserId, gymId)) {
    throw new TrainerServiceError("FORBIDDEN", "Only a gym owner or super admin can remove trainers");
  }
  const assignment = await prisma.trainerAssignment.findUnique({
    where: { gymId_trainerUserId_memberUserId: { gymId, trainerUserId, memberUserId } },
  });
  if (!assignment) throw new TrainerServiceError("ASSIGNMENT_NOT_FOUND", "Trainer assignment not found");
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.trainerAssignment.delete({ where: { id: assignment.id } });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        gymId,
        action: "TRAINER_UNASSIGNED",
        targetType: "TrainerAssignment",
        targetId: assignment.id,
        metadata: { trainerUserId, memberUserId },
      },
    });
    return assignment;
  });
}

export async function getMemberTrainer(memberUserId: string, gymId: string) {
  return prisma.trainerAssignment.findFirst({
    where: { memberUserId, gymId, isPrimary: true },
    include: { trainer: { include: { trainerProfile: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTrainerMembers(trainerUserId: string, gymId: string) {
  const membership = await activeMembership(trainerUserId, gymId);
  if (!membership || !new Set<GymRole>([GymRole.TRAINER, GymRole.OWNER]).has(membership.role)) {
    throw new TrainerServiceError("FORBIDDEN", "Trainer is not active in this gym");
  }
  return prisma.trainerAssignment.findMany({
    where: { trainerUserId, gymId },
    include: {
      member: {
        select: {
          id: true,
          firstName: true,
          telegramUsername: true,
          profile: { select: { goal: true, weightKg: true } },
          weeklyCheckIns: {
            where: { status: "EVALUATED" },
            orderBy: { evaluatedAt: "desc" },
            take: 1,
            select: { evaluatedAt: true },
          },
          agentDecisions: {
            where: { gymId },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { reason: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

const preferencesSchema = z.object({
  preferredWorkoutStyle: z.string().trim().max(500).nullable().optional(),
  preferredRepRanges: z.unknown().nullable().optional(),
  exercisePreferences: z.unknown().nullable().optional(),
  nutritionNotes: z.string().trim().max(2_000).nullable().optional(),
}).strict();

export async function updateTrainerPreferences(
  actorUserId: string,
  trainerUserId: string,
  gymId: string,
  input: z.infer<typeof preferencesSchema>,
) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { systemRole: true } });
  const actorCanManage = actor?.systemRole === SystemRole.SUPER_ADMIN || await canManageGym(actorUserId, gymId);
  const trainerMembership = await activeMembership(trainerUserId, gymId);
  if (!trainerMembership || !new Set<GymRole>([GymRole.TRAINER, GymRole.OWNER]).has(trainerMembership.role)) {
    throw new TrainerServiceError("INVALID_TRAINER", "Trainer is not active in this gym");
  }
  if (actorUserId !== trainerUserId && !actorCanManage) {
    throw new TrainerServiceError("FORBIDDEN", "Actor cannot update these trainer preferences");
  }
  const parsed = preferencesSchema.parse(input);
  const data = Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as Prisma.TrainerPreferencesUncheckedUpdateInput;
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const preferences = await transaction.trainerPreferences.upsert({
      where: { trainerUserId_gymId: { trainerUserId, gymId } },
      update: data,
      create: { trainerUserId, gymId, ...data } as Prisma.TrainerPreferencesUncheckedCreateInput,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId,
        gymId,
        action: "TRAINER_PREFERENCES_UPDATED",
        targetType: "TrainerPreferences",
        targetId: preferences.id,
        metadata: { trainerUserId, changedFields: Object.keys(parsed) },
      },
    });
    return preferences;
  });
}
