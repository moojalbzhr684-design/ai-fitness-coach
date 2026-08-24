import { GymRole } from "../generated/prisma/client.js";
import type { authenticateMemberRequest } from "./member-session.js";
import { MemberAuthenticationError } from "./member-session.js";

type AuthenticatedRequest = Awaited<ReturnType<typeof authenticateMemberRequest>>;

export function resolveMemberGymScope(auth: AuthenticatedRequest, requestedGymId?: string) {
  const memberships = auth.session.user.gymMemberships.filter((item) => item.role === GymRole.MEMBER);
  if (requestedGymId) {
    const membership = memberships.find((item) => item.gymId === requestedGymId);
    if (!membership) throw new MemberAuthenticationError("FORBIDDEN", "Selected gym is outside the member's active scope");
    return { gymId: membership.gymId, membership, memberships };
  }
  if (memberships.length > 1) {
    throw new MemberAuthenticationError("GYM_SELECTION_REQUIRED", "Select one of your active gyms");
  }
  return { gymId: memberships[0]?.gymId ?? null, membership: memberships[0] ?? null, memberships };
}
