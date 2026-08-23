import { GymRole, MembershipStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export class GymScopeError extends Error {
  constructor(
    public readonly code: "NO_GYM" | "AMBIGUOUS_GYM" | "FORBIDDEN_GYM",
    message: string,
  ) {
    super(message);
    this.name = "GymScopeError";
  }
}

export async function getActiveGymMemberships(
  userId: string,
  roles?: GymRole[],
) {
  return prisma.gymMembership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      gym: { isActive: true },
      ...(roles?.length ? { role: { in: roles } } : {}),
    },
    include: { gym: { include: { settings: true } } },
    orderBy: [{ gym: { name: "asc" } }, { createdAt: "asc" }],
  });
}

export async function resolveGymMembership(params: {
  userId: string;
  membershipId?: string;
  roles?: GymRole[];
}) {
  const memberships = await getActiveGymMemberships(params.userId, params.roles);
  if (!memberships.length) {
    throw new GymScopeError("NO_GYM", "No active gym membership is available");
  }
  if (params.membershipId) {
    const selected = memberships.find((item) => item.id === params.membershipId);
    if (!selected) throw new GymScopeError("FORBIDDEN_GYM", "Selected gym is outside actor scope");
    return { membership: selected, memberships, selectionRequired: false };
  }
  if (memberships.length > 1) {
    return { membership: null, memberships, selectionRequired: true };
  }
  return { membership: memberships[0]!, memberships, selectionRequired: false };
}
