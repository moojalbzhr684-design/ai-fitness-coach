import {
  CheckInStatus,
  MediaVisibility,
  MembershipStatus,
  NutritionPlanStatus,
  WorkoutProgramStatus,
  WorkoutSessionStatus,
} from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";

export async function getCoachingMemberRecord(
  gymId: string,
  memberUserId: string,
  photoAccess: "GYM" | "TRAINER" | "SUPER_ADMIN",
) {
  const user = await prisma.user.findFirst({
    where: {
      id: memberUserId,
      gymMemberships: { some: { gymId, status: MembershipStatus.ACTIVE } },
    },
    include: {
      profile: true,
      memberAssignments: {
        where: { gymId },
        include: { trainer: { select: { id: true, firstName: true, lastName: true, telegramUsername: true } } },
      },
      bodyMeasurements: { where: { OR: [{ gymId }, { gymId: null }] }, orderBy: { measuredAt: "asc" }, take: 100 },
      weeklyCheckIns: {
        where: { gymId, status: CheckInStatus.EVALUATED }, orderBy: { evaluatedAt: "desc" }, take: 20,
        include: { evaluation: true },
      },
      workoutPrograms: {
        where: { gymId, status: WorkoutProgramStatus.ACTIVE }, orderBy: { startedAt: "desc" }, take: 1,
        include: { days: { orderBy: { dayNumber: "asc" }, include: { exercises: { orderBy: { order: "asc" }, include: { exercise: true } } } } },
      },
      workoutSessions: {
        where: { gymId, status: WorkoutSessionStatus.COMPLETED }, orderBy: { completedAt: "desc" }, take: 10,
        include: { workoutDay: { select: { name: true } }, exerciseLogs: { include: { exercise: true, setLogs: true } } },
      },
      nutritionPlans: {
        where: { gymId, status: NutritionPlanStatus.ACTIVE }, orderBy: { startedAt: "desc" }, take: 1,
        include: { target: true, meals: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" }, include: { food: true } } } } },
      },
      agentDecisions: { where: { gymId }, orderBy: { createdAt: "desc" }, take: 20, include: { approvalRequest: true } },
      memberApprovals: { where: { gymId }, orderBy: { createdAt: "desc" }, take: 20 },
      progressPhotoSets: {
        where: { gymId }, orderBy: { capturedAt: "desc" }, take: 20,
        include: { analysis: true, photos: { select: { id: true, view: true, visibility: true } } },
      },
    },
  });
  if (!user) return null;
  const photoAllowed = photoAccess === "SUPER_ADMIN"
    || (photoAccess === "GYM" && user.profile?.allowGymPhotoAccess)
    || (photoAccess === "TRAINER" && user.profile?.allowTrainerPhotoAccess);
  return {
    ...user,
    progressPhotoSets: photoAllowed
      ? user.progressPhotoSets.map((set) => ({
          ...set,
          photos: set.photos.filter((photo) => photoAccess === "SUPER_ADMIN"
            || (photoAccess === "GYM" && photo.visibility === MediaVisibility.GYM_ALLOWED)
            || (photoAccess === "TRAINER" && (photo.visibility === MediaVisibility.TRAINER_ALLOWED || photo.visibility === MediaVisibility.GYM_ALLOWED))),
        }))
      : [],
  };
}
