import {
  ApprovalStatus,
  GymRole,
  MembershipStatus,
  SystemRole,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { systemRole: true },
  });
  return user?.systemRole === SystemRole.SUPER_ADMIN;
}

export async function getActiveGymMembership(userId: string, gymId: string) {
  return prisma.gymMembership.findFirst({
    where: {
      userId,
      gymId,
      status: MembershipStatus.ACTIVE,
      gym: { isActive: true },
    },
    include: { gym: { include: { settings: true } } },
  });
}

export async function canManageGym(actorUserId: string, gymId: string): Promise<boolean> {
  if (await isSuperAdmin(actorUserId)) return true;
  const membership = await getActiveGymMembership(actorUserId, gymId);
  return membership?.role === GymRole.OWNER;
}

export async function canManageMember(
  actorUserId: string,
  gymId: string,
  memberUserId: string,
): Promise<boolean> {
  const member = await getActiveGymMembership(memberUserId, gymId);
  if (member?.role !== GymRole.MEMBER) return false;
  if (await isSuperAdmin(actorUserId)) return true;
  const actor = await getActiveGymMembership(actorUserId, gymId);
  if (actor?.role === GymRole.OWNER) return true;
  if (actor?.role !== GymRole.TRAINER) return false;
  const assignment = await prisma.trainerAssignment.findUnique({
    where: {
      gymId_trainerUserId_memberUserId: {
        gymId,
        trainerUserId: actorUserId,
        memberUserId,
      },
    },
    select: { id: true },
  });
  return Boolean(assignment);
}

export async function canReviewApproval(
  actorUserId: string,
  approvalRequestId: string,
): Promise<boolean> {
  const request = await prisma.approvalRequest.findUnique({
    where: { id: approvalRequestId },
    select: {
      id: true,
      gymId: true,
      trainerUserId: true,
      status: true,
    },
  });
  if (!request || request.status !== ApprovalStatus.PENDING) return false;
  if (await isSuperAdmin(actorUserId)) return true;
  const membership = await getActiveGymMembership(actorUserId, request.gymId);
  if (membership?.role === GymRole.OWNER) return true;
  return membership?.role === GymRole.TRAINER && request.trainerUserId === actorUserId;
}
