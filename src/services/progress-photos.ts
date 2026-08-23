import {
  GymRole,
  MediaPurpose,
  MediaType,
  MediaVisibility,
  MembershipStatus,
  OnboardingStep,
  PhotoAnalysisStatus,
  PhotoView,
  SystemRole,
} from "../generated/prisma/client.js";
import type { MediaStorage } from "../media/storage.js";
import type { TelegramPhotoInput } from "../media/types.js";
import { prisma } from "../lib/prisma.js";
import { compareAnalysisResults } from "../vision/comparison.js";
import type { VisionAnalysisResult } from "../vision/types.js";

const REQUIRED_PHOTO_VIEWS = [PhotoView.FRONT, PhotoView.SIDE, PhotoView.BACK] as const;

export class ProgressPhotoError extends Error {
  constructor(
    public readonly code:
      | "USER_NOT_READY"
      | "SET_NOT_FOUND"
      | "SET_ALREADY_COMPLETE"
      | "NO_PHOTOS"
      | "CONFIRMATION_MISMATCH"
      | "PRIVACY_NOT_ALLOWED"
      | "GYM_SELECTION_REQUIRED"
      | "INVALID_GYM",
    message: string,
  ) {
    super(message);
    this.name = "ProgressPhotoError";
  }
}

export function nextMissingPhotoView(views: Iterable<PhotoView>): PhotoView | null {
  const present = new Set(views);
  return REQUIRED_PHOTO_VIEWS.find((view) => !present.has(view)) ?? null;
}

export function isProgressPhotoSetComplete(views: Iterable<PhotoView>): boolean {
  return nextMissingPhotoView(views) === null;
}

const photoSetInclude = {
  photos: {
    orderBy: { createdAt: "asc" as const },
    include: { media: true },
  },
  analysis: true,
} as const;

export async function setPhotoPrivacyPreferences(
  userId: string,
  preferences: {
    allowVisionAnalysis?: boolean;
    allowTrainerPhotoAccess?: boolean;
    allowGymPhotoAccess?: boolean;
  },
) {
  const changed = Object.keys(preferences);
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const profile = await transaction.userProfile.update({
      where: { userId },
      data: preferences,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        action: "PHOTO_PRIVACY_CHANGED",
        targetType: "UserProfile",
        targetId: profile.id,
        metadata: { changedFields: changed },
      },
    });
    return profile;
  });
}

export async function getDraftProgressPhotoSet(userId: string) {
  return prisma.progressPhotoSet.findFirst({
    where: { userId, completedAt: null },
    include: photoSetInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrCreateProgressPhotoSet(
  userId: string,
  analysisRequested: boolean,
  requestedGymId?: string,
) {
  const existing = await getDraftProgressPhotoSet(userId);
  if (existing) return { photoSet: existing, resumed: true };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      gymMemberships: {
        where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
        orderBy: { createdAt: "asc" },
      },
      bodyMeasurements: {
        where: { waistCm: { not: null } },
        orderBy: { measuredAt: "desc" },
        take: 1,
        select: { waistCm: true },
      },
    },
  });
  if (!user?.profile || user.onboardingStep !== OnboardingStep.COMPLETE) {
    throw new ProgressPhotoError("USER_NOT_READY", "Complete onboarding before uploading progress photos");
  }
  if (analysisRequested && !user.profile.allowVisionAnalysis) {
    throw new ProgressPhotoError("PRIVACY_NOT_ALLOWED", "Vision consent is required");
  }
  if (!requestedGymId && user.gymMemberships.length > 1) {
    throw new ProgressPhotoError("GYM_SELECTION_REQUIRED", "Select a gym before starting progress photos");
  }
  const membership = requestedGymId
    ? user.gymMemberships.find((item) => item.gymId === requestedGymId)
    : user.gymMemberships[0];
  if (requestedGymId && !membership) {
    throw new ProgressPhotoError("INVALID_GYM", "Selected gym is outside the user's active memberships");
  }
  const gymId = membership?.gymId ?? null;
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const created = await transaction.progressPhotoSet.create({
      data: {
        userId,
        gymId,
        capturedAt: new Date(),
        weightKg: user.profile?.weightKg ?? null,
        waistCm: user.bodyMeasurements[0]?.waistCm ?? null,
        analysisRequested,
        analysis: {
          create: {
            userId,
            gymId,
            status: analysisRequested
              ? PhotoAnalysisStatus.PENDING
              : PhotoAnalysisStatus.SKIPPED,
          },
        },
      },
      include: photoSetInclude,
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        gymId,
        action: "PROGRESS_PHOTO_SET_CREATED",
        targetType: "ProgressPhotoSet",
        targetId: created.id,
        metadata: { analysisRequested },
      },
    });
    return { photoSet: created, resumed: false };
  });
}

function purposeFor(view: PhotoView): MediaPurpose {
  if (view === PhotoView.FRONT) return MediaPurpose.PROGRESS_FRONT;
  if (view === PhotoView.SIDE) return MediaPurpose.PROGRESS_SIDE;
  if (view === PhotoView.BACK) return MediaPurpose.PROGRESS_BACK;
  return MediaPurpose.OTHER;
}

export async function addTelegramProgressPhoto(params: {
  userId: string;
  photoSetId: string;
  input: TelegramPhotoInput;
  storage: MediaStorage;
}) {
  const photoSet = await prisma.progressPhotoSet.findFirst({
    where: { id: params.photoSetId, userId: params.userId },
    include: { photos: { select: { view: true } }, user: { include: { profile: true } } },
  });
  if (!photoSet) throw new ProgressPhotoError("SET_NOT_FOUND", "Progress photo set not found");
  if (photoSet.completedAt) {
    throw new ProgressPhotoError("SET_ALREADY_COMPLETE", "Progress photo set is already complete");
  }
  const view = nextMissingPhotoView(photoSet.photos.map((photo) => photo.view));
  if (!view) throw new ProgressPhotoError("SET_ALREADY_COMPLETE", "Progress photo set is already complete");
  const stored = await params.storage.saveFromTelegram(params.input);
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const media = await transaction.media.create({
      data: {
        userId: params.userId,
        gymId: photoSet.gymId,
        type: MediaType.PHOTO,
        purpose: purposeFor(view),
        telegramFileId: stored.telegramFileId,
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        width: stored.width,
        height: stored.height,
      },
    });
    const photo = await transaction.progressPhoto.create({
      data: {
        photoSetId: photoSet.id,
        mediaId: media.id,
        view,
        visibility: MediaVisibility.PRIVATE,
      },
      include: { media: true },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: params.userId,
        gymId: photoSet.gymId,
        action: "PROGRESS_PHOTO_UPLOADED",
        targetType: "ProgressPhoto",
        targetId: photo.id,
        metadata: { view, sizeBytes: stored.sizeBytes?.toString() ?? null },
      },
    });
    const allPhotos = await transaction.progressPhoto.findMany({
      where: { photoSetId: photoSet.id },
      select: { view: true },
    });
    const complete = isProgressPhotoSetComplete(allPhotos.map((item) => item.view));
    const consentStillAllowed = Boolean(photoSet.user.profile?.allowVisionAnalysis);
    const shouldAnalyze = complete && photoSet.analysisRequested && consentStillAllowed;
    if (complete) {
      await transaction.progressPhotoSet.update({
        where: { id: photoSet.id },
        data: { completedAt: new Date() },
      });
      if (!shouldAnalyze) {
        await transaction.progressPhotoAnalysis.upsert({
          where: { photoSetId: photoSet.id },
          update: { status: PhotoAnalysisStatus.SKIPPED, errorMessage: null },
          create: {
            photoSetId: photoSet.id,
            userId: params.userId,
            gymId: photoSet.gymId,
            status: PhotoAnalysisStatus.SKIPPED,
          },
        });
      }
    }
    return {
      photo,
      view,
      complete,
      shouldAnalyze,
      nextView: complete ? null : nextMissingPhotoView(allPhotos.map((item) => item.view)),
    };
  });
}

export async function getLatestProgressPhotoSet(userId: string) {
  return prisma.progressPhotoSet.findFirst({
    where: { userId },
    include: photoSetInclude,
    orderBy: { capturedAt: "desc" },
  });
}

export async function getPhotoProgressSummary(userId: string) {
  const [count, latest] = await Promise.all([
    prisma.progressPhotoSet.count({ where: { userId, completedAt: { not: null } } }),
    prisma.progressPhotoSet.findFirst({
      where: { userId, completedAt: { not: null } },
      include: { analysis: true },
      orderBy: { capturedAt: "desc" },
    }),
  ]);
  return { count, latest };
}

function analysisToResult(analysis: {
  overallSummary: string | null;
  frontSummary: string | null;
  sideSummary: string | null;
  backSummary: string | null;
  symmetryNotes: string | null;
  postureNotes: string | null;
  muscularityNotes: string | null;
  leannessNotes: string | null;
  comparisonSummary: string | null;
  confidenceLabel: string | null;
}): VisionAnalysisResult | null {
  if (!analysis.overallSummary) return null;
  const confidence = analysis.confidenceLabel;
  return {
    overallSummary: analysis.overallSummary,
    frontSummary: analysis.frontSummary,
    sideSummary: analysis.sideSummary,
    backSummary: analysis.backSummary,
    symmetryNotes: analysis.symmetryNotes,
    postureNotes: analysis.postureNotes,
    muscularityNotes: analysis.muscularityNotes,
    leannessNotes: analysis.leannessNotes,
    comparisonSummary: analysis.comparisonSummary,
    confidenceLabel: confidence === "LOW" || confidence === "MEDIUM" || confidence === "HIGH"
      ? confidence
      : null,
  };
}

export async function compareProgressPhotoSets(
  previousPhotoSetId: string | null,
  currentPhotoSetId: string,
) {
  const [previous, current] = await Promise.all([
    previousPhotoSetId
      ? prisma.progressPhotoAnalysis.findUnique({ where: { photoSetId: previousPhotoSetId } })
      : null,
    prisma.progressPhotoAnalysis.findUnique({ where: { photoSetId: currentPhotoSetId } }),
  ]);
  const previousResult = previous?.status === PhotoAnalysisStatus.COMPLETED
    ? analysisToResult(previous)
    : null;
  const currentResult = current?.status === PhotoAnalysisStatus.COMPLETED
    ? analysisToResult(current)
    : null;
  return compareAnalysisResults(previousResult, currentResult);
}

export async function setProgressPhotoVisibility(
  userId: string,
  photoId: string,
  visibility: MediaVisibility,
) {
  const photo = await prisma.progressPhoto.findFirst({
    where: { id: photoId, photoSet: { userId } },
    include: { photoSet: { include: { user: { include: { profile: true } } } } },
  });
  if (!photo) throw new ProgressPhotoError("SET_NOT_FOUND", "Progress photo not found");
  const profile = photo.photoSet.user.profile;
  if (visibility === MediaVisibility.TRAINER_ALLOWED && !profile?.allowTrainerPhotoAccess) {
    throw new ProgressPhotoError("PRIVACY_NOT_ALLOWED", "Trainer photo consent is required");
  }
  if (visibility === MediaVisibility.GYM_ALLOWED && !profile?.allowGymPhotoAccess) {
    throw new ProgressPhotoError("PRIVACY_NOT_ALLOWED", "Gym photo consent is required");
  }
  return prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    const updated = await transaction.progressPhoto.update({
      where: { id: photoId },
      data: { visibility },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        gymId: photo.photoSet.gymId,
        action: "PHOTO_PRIVACY_CHANGED",
        targetType: "ProgressPhoto",
        targetId: photoId,
        metadata: { visibility },
      },
    });
    return updated;
  });
}

export async function canUserViewProgressPhoto(actorUserId: string, photoId: string) {
  const [actor, photo] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      include: { gymMemberships: { where: { status: MembershipStatus.ACTIVE } } },
    }),
    prisma.progressPhoto.findUnique({
      where: { id: photoId },
      include: { photoSet: { include: { user: { include: { profile: true } } } } },
    }),
  ]);
  if (!actor || !photo) return false;
  if (photo.photoSet.userId === actorUserId) return true;

  let allowed = actor.systemRole === SystemRole.SUPER_ADMIN;
  let accessPath = allowed ? "SUPER_ADMIN" : null;
  const gymId = photo.photoSet.gymId;
  if (!allowed && gymId) {
    const membership = actor.gymMemberships.find((item) => item.gymId === gymId);
    const profile = photo.photoSet.user.profile;
    if (
      membership?.role === GymRole.TRAINER
      && profile?.allowTrainerPhotoAccess
      && (photo.visibility === MediaVisibility.TRAINER_ALLOWED
        || photo.visibility === MediaVisibility.GYM_ALLOWED)
    ) {
      allowed = true;
      accessPath = "TRAINER";
    } else if (
      membership?.role === GymRole.OWNER
      && profile?.allowGymPhotoAccess
      && photo.visibility === MediaVisibility.GYM_ALLOWED
    ) {
      allowed = true;
      accessPath = "GYM_OWNER";
    }
  }
  if (allowed) {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        gymId,
        action: "PROGRESS_PHOTO_VIEWED",
        targetType: "ProgressPhoto",
        targetId: photoId,
        metadata: { accessPath },
      },
    });
  }
  return allowed;
}

export async function deleteLatestProgressPhotoSet(params: {
  userId: string;
  confirmedPhotoSetId: string;
  storage: MediaStorage;
}) {
  const latest = await getLatestProgressPhotoSet(params.userId);
  if (!latest) throw new ProgressPhotoError("NO_PHOTOS", "No progress photos exist");
  if (latest.id !== params.confirmedPhotoSetId) {
    throw new ProgressPhotoError("CONFIRMATION_MISMATCH", "Deletion confirmation is stale");
  }
  for (const photo of latest.photos) {
    await params.storage.delete(photo.media);
  }
  const mediaIds = latest.photos.map((photo) => photo.mediaId);
  await prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.progressPhotoSet.delete({ where: { id: latest.id } });
    if (mediaIds.length) {
      await transaction.media.deleteMany({ where: { id: { in: mediaIds } } });
    }
    await transaction.auditLog.create({
      data: {
        actorUserId: params.userId,
        gymId: latest.gymId,
        action: "PROGRESS_PHOTOS_DELETED",
        targetType: "ProgressPhotoSet",
        targetId: latest.id,
        metadata: { photoCount: mediaIds.length },
      },
    });
  });
  return { deletedPhotoSetId: latest.id, deletedPhotoCount: mediaIds.length };
}
