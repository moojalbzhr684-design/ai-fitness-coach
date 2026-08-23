import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, SystemRole } from "../../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  canView: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    progressPhoto: { findUnique: vi.fn() },
    gymMembership: { findFirst: vi.fn() },
    trainerAssignment: { findUnique: vi.fn() },
  },
}));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../progress-photos.js", () => ({ canUserViewProgressPhoto: mocks.canView }));

import { authorizeDashboardPhotoView } from "./photos.js";

function actor(role: GymRole, systemRole: SystemRole = SystemRole.USER) {
  return { id: "actor", systemRole, gymMemberships: [{ gymId: "gym-a", role, gym: { id: "gym-a", settings: null } }] };
}

const photo = { id: "photo-1", photoSet: { userId: "member-a", gymId: "gym-a" } };
const authorizedPhoto = { ...photo, media: { telegramFileId: "private-file-id", storageKey: null, mimeType: "image/jpeg", sizeBytes: 100n } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.gymMembership.findFirst.mockResolvedValue({ id: "member-membership" });
  mocks.canView.mockResolvedValue(true);
});

describe("dashboard private photo access", () => {
  it("allows an assigned same-gym trainer only after both scope and consent checks", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor(GymRole.TRAINER));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValueOnce(photo).mockResolvedValueOnce(authorizedPhoto);
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValue({ id: "assignment" });
    await expect(authorizeDashboardPhotoView("trainer-a", "photo-1")).resolves.toEqual(authorizedPhoto);
    expect(mocks.canView).toHaveBeenCalledWith("trainer-a", "photo-1");
  });

  it("blocks an unassigned trainer before any media reference is loaded", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor(GymRole.TRAINER));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValue(photo);
    mocks.prisma.trainerAssignment.findUnique.mockResolvedValue(null);
    await expect(authorizeDashboardPhotoView("trainer-a", "photo-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.canView).not.toHaveBeenCalled();
  });

  it("uses the audited privileged permission path for super admin", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(actor(GymRole.MEMBER, SystemRole.SUPER_ADMIN));
    mocks.prisma.progressPhoto.findUnique.mockResolvedValueOnce(photo).mockResolvedValueOnce(authorizedPhoto);
    await authorizeDashboardPhotoView("admin", "photo-1");
    expect(mocks.canView).toHaveBeenCalledWith("admin", "photo-1");
  });
});
