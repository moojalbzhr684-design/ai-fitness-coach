import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    gymSettings: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    canManageGym: vi.fn(),
    prisma: {
      gym: { findUnique: vi.fn() },
      media: { findFirst: vi.fn() },
      gymMembership: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
    },
    tx,
  };
});
vi.mock("../auth/permissions.js", () => ({ canManageGym: mocks.canManageGym }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { getEffectiveGymBranding, GymSettingsError, updateGymSettings } from "./gym-settings.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
});

describe("gym settings", () => {
  it("lets an authorized owner update structured settings and audits changed fields", async () => {
    mocks.canManageGym.mockResolvedValue(true);
    mocks.prisma.gym.findUnique.mockResolvedValue({ id: "gym-a" });
    mocks.tx.gymSettings.upsert.mockResolvedValue({ id: "settings-a", gymId: "gym-a" });
    await updateGymSettings("owner-a", "gym-a", { aiDisplayName: "Power Coach", primaryColor: "#112233" });
    expect(mocks.tx.gymSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { gymId: "gym-a" } }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: "owner-a", gymId: "gym-a", action: "GYM_SETTINGS_UPDATED" }),
    });
  });

  it.each(["trainer-a", "member-a", "owner-of-gym-b"])("blocks unauthorized actor %s", async (actor) => {
    mocks.canManageGym.mockResolvedValue(false);
    await expect(updateGymSettings(actor, "gym-a", { displayName: "Nope" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<GymSettingsError>);
    expect(mocks.tx.gymSettings.upsert).not.toHaveBeenCalled();
  });

  it("accepts a super-admin-authorized update", async () => {
    mocks.canManageGym.mockResolvedValue(true);
    mocks.prisma.gym.findUnique.mockResolvedValue({ id: "gym-b" });
    mocks.tx.gymSettings.upsert.mockResolvedValue({ id: "settings-b", gymId: "gym-b" });
    await expect(updateGymSettings("admin", "gym-b", { defaultLanguage: "ar-IQ" })).resolves.toEqual({
      id: "settings-b", gymId: "gym-b",
    });
  });

  it("rejects a logo from outside the gym scope", async () => {
    mocks.canManageGym.mockResolvedValue(true);
    mocks.prisma.gym.findUnique.mockResolvedValue({ id: "gym-a" });
    mocks.prisma.media.findFirst.mockResolvedValue(null);
    await expect(updateGymSettings("owner-a", "gym-a", { logoMediaId: "gym-b-logo" })).rejects.toMatchObject({
      code: "INVALID_LOGO",
    } satisfies Partial<GymSettingsError>);
  });

  it("never chooses an arbitrary branding identity for multiple memberships", async () => {
    mocks.prisma.gymMembership.findMany.mockResolvedValue([
      { id: "membership-a", gym: { id: "gym-a", name: "Gym A", settings: null } },
      { id: "membership-b", gym: { id: "gym-b", name: "Gym B", settings: null } },
    ]);
    await expect(getEffectiveGymBranding("member")).resolves.toEqual(expect.objectContaining({
      ambiguous: true,
      branding: null,
      gyms: expect.arrayContaining([expect.objectContaining({ gymId: "gym-a" }), expect.objectContaining({ gymId: "gym-b" })]),
    }));
  });
});
