import { GymRole, SystemRole } from "../../generated/prisma/client.js";
import {
  DashboardAuthorizationError,
  getDashboardActor,
  requireOwnerMemberAccess,
  requireTrainerMemberAccess,
} from "../../auth/dashboard-auth.js";
import { prisma } from "../../lib/prisma.js";
import { canUserViewProgressPhoto } from "../progress-photos.js";
import { opaqueIdSchema } from "./common.js";

export async function authorizeDashboardPhotoView(actorUserId: string, photoId: string) {
  opaqueIdSchema.parse(photoId);
  const [actor, photo] = await Promise.all([
    getDashboardActor(actorUserId),
    prisma.progressPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, photoSet: { select: { userId: true, gymId: true } } },
    }),
  ]);
  if (!actor || !photo?.photoSet.gymId) throw new DashboardAuthorizationError("NOT_FOUND", "Photo not found");
  if (actor.systemRole !== SystemRole.SUPER_ADMIN) {
    const membership = actor.gymMemberships.find((item) => item.gymId === photo.photoSet.gymId);
    if (membership?.role === GymRole.OWNER) {
      await requireOwnerMemberAccess(actorUserId, photo.photoSet.gymId, photo.photoSet.userId);
    } else if (membership?.role === GymRole.TRAINER) {
      await requireTrainerMemberAccess(actorUserId, photo.photoSet.gymId, photo.photoSet.userId);
    } else {
      throw new DashboardAuthorizationError("NOT_FOUND", "Photo not found");
    }
  }
  if (!await canUserViewProgressPhoto(actorUserId, photoId)) {
    throw new DashboardAuthorizationError("NOT_FOUND", "Photo not found");
  }
  const authorized = await prisma.progressPhoto.findUnique({
    where: { id: photoId },
    include: { media: true },
  });
  if (!authorized) throw new DashboardAuthorizationError("NOT_FOUND", "Photo not found");
  return authorized;
}
