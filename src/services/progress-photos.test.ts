import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GymRole,
  MediaPurpose,
  MediaVisibility,
  MembershipStatus,
  OnboardingStep,
  PhotoView,
  SystemRole,
} from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const tx = {
    progressPhotoSet: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    progressPhoto: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    progressPhotoAnalysis: { upsert: vi.fn() },
    media: { create: vi.fn(), deleteMany: vi.fn() },
    userProfile: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    progressPhotoSet: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    progressPhoto: { findFirst: vi.fn(), findUnique: vi.fn() },
    progressPhotoAnalysis: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import {
  addTelegramProgressPhoto,
  canUserViewProgressPhoto,
  deleteLatestProgressPhotoSet,
  getOrCreateProgressPhotoSet,
  isProgressPhotoSetComplete,
  nextMissingPhotoView,
  ProgressPhotoError,
} from "./progress-photos.js";

const profile = {
  weightKg: 78,
  allowVisionAnalysis: false,
  allowTrainerPhotoAccess: false,
  allowGymPhotoAccess: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
});

describe("progress photo sets", () => {
  it("creates a persistent photo set and audit record", async () => {
    mocks.prisma.progressPhotoSet.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      onboardingStep: OnboardingStep.COMPLETE,
      profile,
      gymMemberships: [{ gymId: "gym-1" }],
      bodyMeasurements: [{ waistCm: 84 }],
    });
    mocks.tx.progressPhotoSet.create.mockImplementation(async ({ data }) => ({
      id: "set-1",
      ...data,
      photos: [],
      analysis: null,
    }));
    const result = await getOrCreateProgressPhotoSet("user-1", false);
    expect(result.resumed).toBe(false);
    expect(result.photoSet).toEqual(expect.objectContaining({
      id: "set-1",
      gymId: "gym-1",
      weightKg: 78,
      waistCm: 84,
      analysisRequested: false,
    }));
    expect(mocks.tx.progressPhotoSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        analysis: {
          create: expect.objectContaining({ status: "SKIPPED" }),
        },
      }),
      include: expect.anything(),
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROGRESS_PHOTO_SET_CREATED" }),
    });
  });

  it("blocks analysis-enabled set creation without consent", async () => {
    mocks.prisma.progressPhotoSet.findFirst.mockResolvedValue(null);
    mocks.prisma.user.findUnique.mockResolvedValue({
      onboardingStep: OnboardingStep.COMPLETE,
      profile,
      gymMemberships: [],
      bodyMeasurements: [],
    });
    await expect(getOrCreateProgressPhotoSet("user-1", true)).rejects.toMatchObject({
      code: "PRIVACY_NOT_ALLOWED",
    } satisfies Partial<ProgressPhotoError>);
    expect(mocks.tx.progressPhotoSet.create).not.toHaveBeenCalled();
  });

  it("allows partial sets and advances FRONT, SIDE, BACK exactly once", () => {
    expect(nextMissingPhotoView([])).toBe(PhotoView.FRONT);
    expect(nextMissingPhotoView([PhotoView.FRONT])).toBe(PhotoView.SIDE);
    expect(nextMissingPhotoView([PhotoView.FRONT, PhotoView.SIDE])).toBe(PhotoView.BACK);
    expect(isProgressPhotoSetComplete([PhotoView.FRONT])).toBe(false);
    expect(isProgressPhotoSetComplete([
      PhotoView.FRONT,
      PhotoView.SIDE,
      PhotoView.BACK,
    ])).toBe(true);
    expect(nextMissingPhotoView([PhotoView.FRONT, PhotoView.FRONT])).toBe(PhotoView.SIDE);
    expect(nextMissingPhotoView([PhotoView.FRONT, PhotoView.SIDE, PhotoView.SIDE])).toBe(PhotoView.BACK);
  });

  it.each([
    { existing: [] as PhotoView[], expected: PhotoView.FRONT, purpose: MediaPurpose.PROGRESS_FRONT, complete: false },
    { existing: [PhotoView.FRONT], expected: PhotoView.SIDE, purpose: MediaPurpose.PROGRESS_SIDE, complete: false },
    { existing: [PhotoView.FRONT, PhotoView.SIDE], expected: PhotoView.BACK, purpose: MediaPurpose.PROGRESS_BACK, complete: true },
  ])("persists one $expected photo with private visibility", async ({ existing, expected, purpose, complete }) => {
    mocks.prisma.progressPhotoSet.findFirst.mockResolvedValue({
      id: "set-1",
      userId: "user-1",
      gymId: "gym-1",
      completedAt: null,
      analysisRequested: false,
      photos: existing.map((view) => ({ view })),
      user: { profile: { allowVisionAnalysis: false } },
    });
    mocks.tx.media.create.mockImplementation(async ({ data }) => ({ id: "media-new", ...data }));
    mocks.tx.progressPhoto.create.mockImplementation(async ({ data }) => ({
      id: "photo-new",
      ...data,
      media: { id: "media-new" },
    }));
    mocks.tx.progressPhoto.findMany.mockResolvedValue([...existing, expected].map((view) => ({ view })));
    mocks.tx.progressPhotoAnalysis.upsert.mockResolvedValue({ status: "SKIPPED" });
    const storage = {
      saveFromTelegram: vi.fn(async () => ({
        telegramFileId: "telegram-file",
        storageKey: null,
        mimeType: "image/jpeg",
        sizeBytes: 100n,
        width: 800,
        height: 1200,
      })),
      getReadableReference: vi.fn(),
      delete: vi.fn(),
    };
    const result = await addTelegramProgressPhoto({
      userId: "user-1",
      photoSetId: "set-1",
      input: { fileId: "telegram-file" },
      storage,
    });
    expect(result).toEqual(expect.objectContaining({ view: expected, complete }));
    expect(mocks.tx.media.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose, telegramFileId: "telegram-file" }),
    });
    expect(mocks.tx.progressPhoto.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ view: expected, visibility: MediaVisibility.PRIVATE }),
      include: { media: true },
    });
  });
});

function photoForAccess(overrides: {
  ownerId?: string;
  gymId?: string | null;
  visibility?: MediaVisibility;
  allowTrainer?: boolean;
  allowGym?: boolean;
} = {}) {
  return {
    id: "photo-1",
    visibility: overrides.visibility ?? MediaVisibility.PRIVATE,
    photoSet: {
      userId: overrides.ownerId ?? "owner-1",
      gymId: overrides.gymId === undefined ? "gym-1" : overrides.gymId,
      user: {
        profile: {
          allowTrainerPhotoAccess: overrides.allowTrainer ?? false,
          allowGymPhotoAccess: overrides.allowGym ?? false,
        },
      },
    },
  };
}

function actor(overrides: {
  id?: string;
  role?: GymRole;
  gymId?: string;
  systemRole?: SystemRole;
} = {}) {
  return {
    id: overrides.id ?? "actor-1",
    systemRole: overrides.systemRole ?? SystemRole.USER,
    gymMemberships: overrides.role
      ? [{ gymId: overrides.gymId ?? "gym-1", role: overrides.role, status: MembershipStatus.ACTIVE }]
      : [],
  };
}

describe("progress photo privacy permissions", () => {
  it("allows the owner to access their own photo", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor({ id: "owner-1" }));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess());
    await expect(canUserViewProgressPhoto("owner-1", "photo-1")).resolves.toBe(true);
  });

  it("blocks a trainer by default", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor({ role: GymRole.TRAINER }));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess({
      visibility: MediaVisibility.TRAINER_ALLOWED,
    }));
    await expect(canUserViewProgressPhoto("actor-1", "photo-1")).resolves.toBe(false);
  });

  it("allows a same-gym trainer only with consent and permitted visibility", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor({ role: GymRole.TRAINER }));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess({
      visibility: MediaVisibility.TRAINER_ALLOWED,
      allowTrainer: true,
    }));
    await expect(canUserViewProgressPhoto("actor-1", "photo-1")).resolves.toBe(true);
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { accessPath: "TRAINER" } }),
    });
  });

  it("blocks a trainer from a different gym", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor({
      role: GymRole.TRAINER,
      gymId: "gym-2",
    }));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess({
      visibility: MediaVisibility.TRAINER_ALLOWED,
      allowTrainer: true,
    }));
    await expect(canUserViewProgressPhoto("actor-1", "photo-1")).resolves.toBe(false);
  });

  it("blocks gym access by default and permits a consented same-gym owner", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor({ role: GymRole.OWNER }));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess({
      visibility: MediaVisibility.GYM_ALLOWED,
    }));
    await expect(canUserViewProgressPhoto("actor-1", "photo-1")).resolves.toBe(false);
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess({
      visibility: MediaVisibility.GYM_ALLOWED,
      allowGym: true,
    }));
    await expect(canUserViewProgressPhoto("actor-1", "photo-1")).resolves.toBe(true);
  });

  it("allows and audits the super-admin access path", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor({ systemRole: SystemRole.SUPER_ADMIN }));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photoForAccess());
    await expect(canUserViewProgressPhoto("actor-1", "photo-1")).resolves.toBe(true);
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { accessPath: "SUPER_ADMIN" } }),
    });
  });
});

describe("progress photo deletion", () => {
  it("deletes the confirmed latest set, only its media, and writes an audit log", async () => {
    const media1 = { telegramFileId: "file-1", storageKey: null, mimeType: "image/jpeg", sizeBytes: 100n };
    const media2 = { telegramFileId: "file-2", storageKey: null, mimeType: "image/jpeg", sizeBytes: 100n };
    mocks.prisma.progressPhotoSet.findFirst.mockResolvedValue({
      id: "set-1",
      userId: "user-1",
      gymId: "gym-1",
      photos: [
        { mediaId: "media-1", media: media1 },
        { mediaId: "media-2", media: media2 },
      ],
      analysis: { id: "analysis-1" },
    });
    const storage = { saveFromTelegram: vi.fn(), getReadableReference: vi.fn(), delete: vi.fn() };
    const result = await deleteLatestProgressPhotoSet({
      userId: "user-1",
      confirmedPhotoSetId: "set-1",
      storage,
    });
    expect(result.deletedPhotoCount).toBe(2);
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(mocks.tx.progressPhotoSet.delete).toHaveBeenCalledWith({ where: { id: "set-1" } });
    expect(mocks.tx.media.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["media-1", "media-2"] } },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PROGRESS_PHOTOS_DELETED" }),
    });
  });
});
