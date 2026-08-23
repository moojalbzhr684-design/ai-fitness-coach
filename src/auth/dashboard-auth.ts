import {
  GymRole,
  MembershipStatus,
  SystemRole,
} from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export class DashboardAuthorizationError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "GYM_SELECTION_REQUIRED" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "DashboardAuthorizationError";
  }
}

export async function getDashboardActor(actorUserId: string) {
  return prisma.user.findUnique({
    where: { id: actorUserId },
    include: {
      gymMemberships: {
        where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
        include: { gym: { include: { settings: true } } },
        orderBy: [{ gym: { name: "asc" } }, { createdAt: "asc" }],
      },
    },
  });
}

export async function requireAdminActor(actorUserId: string) {
  const actor = await getDashboardActor(actorUserId);
  if (!actor || actor.systemRole !== SystemRole.SUPER_ADMIN) {
    throw new DashboardAuthorizationError("FORBIDDEN", "Staff dashboard access denied");
  }
  return actor;
}

export async function resolveDashboardGym(params: {
  actorUserId: string;
  role: "OWNER" | "TRAINER";
  requestedGymId?: string;
}) {
  const actor = await getDashboardActor(params.actorUserId);
  if (!actor) throw new DashboardAuthorizationError("UNAUTHENTICATED", "Dashboard session user is unavailable");
  const memberships = actor.gymMemberships.filter((item) => item.role === params.role);
  if (params.requestedGymId) {
    const membership = memberships.find((item) => item.gymId === params.requestedGymId);
    if (!membership) throw new DashboardAuthorizationError("FORBIDDEN", "Staff dashboard access denied");
    return { actor, membership, memberships, selectionRequired: false };
  }
  if (memberships.length === 0) throw new DashboardAuthorizationError("FORBIDDEN", "Staff dashboard access denied");
  if (memberships.length > 1) return { actor, membership: null, memberships, selectionRequired: true };
  return { actor, membership: memberships[0]!, memberships, selectionRequired: false };
}

export async function requireGymMemberInScope(gymId: string, memberUserId: string) {
  const membership = await prisma.gymMembership.findFirst({
    where: {
      gymId,
      userId: memberUserId,
      role: GymRole.MEMBER,
      status: MembershipStatus.ACTIVE,
      gym: { isActive: true },
    },
    select: { id: true },
  });
  if (!membership) throw new DashboardAuthorizationError("NOT_FOUND", "Member not found");
  return membership;
}

export async function requireOwnerMemberAccess(
  actorUserId: string,
  gymId: string,
  memberUserId: string,
) {
  await resolveDashboardGym({ actorUserId, role: GymRole.OWNER, requestedGymId: gymId });
  await requireGymMemberInScope(gymId, memberUserId);
}

export async function requireTrainerMemberAccess(
  actorUserId: string,
  gymId: string,
  memberUserId: string,
) {
  await resolveDashboardGym({ actorUserId, role: GymRole.TRAINER, requestedGymId: gymId });
  await requireGymMemberInScope(gymId, memberUserId);
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
  if (!assignment) throw new DashboardAuthorizationError("NOT_FOUND", "Member not found");
  return assignment;
}

export async function getDashboardDestinations(actorUserId: string) {
  const actor = await getDashboardActor(actorUserId);
  if (!actor) throw new DashboardAuthorizationError("UNAUTHENTICATED", "Dashboard session user is unavailable");
  const destinations: Array<{ kind: "ADMIN" | "OWNER" | "TRAINER"; href: string; label: string }> = [];
  if (actor.systemRole === SystemRole.SUPER_ADMIN) {
    destinations.push({ kind: "ADMIN", href: "/admin", label: "Master Admin" });
  }
  for (const membership of actor.gymMemberships) {
    if (membership.role === GymRole.OWNER) {
      destinations.push({ kind: "OWNER", href: `/gym?gymId=${encodeURIComponent(membership.gymId)}`, label: membership.gym.settings?.displayName ?? membership.gym.name });
    } else if (membership.role === GymRole.TRAINER) {
      destinations.push({ kind: "TRAINER", href: `/trainer?gymId=${encodeURIComponent(membership.gymId)}`, label: membership.gym.settings?.displayName ?? membership.gym.name });
    }
  }
  return { actor, destinations };
}
