import { GymRole, MembershipStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

export async function joinGymAsMember(userId: string, rawJoinCode: string) {
  const joinCode = rawJoinCode.trim().toUpperCase();

  if (!joinCode) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    // Prisma's transaction client is the same model surface without connection methods.
    const transaction = tx as unknown as typeof prisma;
    const gym = await transaction.gym.findFirst({
      where: {
        joinCode: { equals: joinCode, mode: "insensitive" },
        isActive: true,
      },
    });

    if (!gym) {
      return null;
    }

    const membership = await transaction.gymMembership.upsert({
      where: { gymId_userId: { gymId: gym.id, userId } },
      update: { status: MembershipStatus.ACTIVE },
      create: {
        gymId: gym.id,
        userId,
        role: GymRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        gymId: gym.id,
        action: "USER_JOINED_GYM",
        targetType: "GymMembership",
        targetId: membership.id,
        metadata: { role: membership.role },
      },
    });

    return { gym, membership };
  });
}
