import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityProvider, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({ prisma: {
  user: { upsert: vi.fn() },
  userIdentity: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
} }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { upsertTelegramUser } from "./users.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback: (database: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  mocks.prisma.user.upsert.mockResolvedValue({ id: "existing-user", telegramId: 123n, profile: {} });
  mocks.prisma.userIdentity.findUnique.mockResolvedValue(null);
  mocks.prisma.userIdentity.create.mockResolvedValue({ id: "telegram-identity" });
});

describe("platform identity transition", () => {
  it("preserves one Telegram User and idempotently repairs its verified identity", async () => {
    await upsertTelegramUser({ telegramId: 123n, firstName: "Ali" });
    expect(mocks.prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { telegramId: 123n },
      create: expect.objectContaining({ telegramId: 123n, systemRole: SystemRole.USER }),
    }));
    expect(mocks.prisma.userIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { provider_providerSubject: { provider: IdentityProvider.TELEGRAM, providerSubject: "123" } } }));
    expect(mocks.prisma.userIdentity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "existing-user", provider: IdentityProvider.TELEGRAM, providerSubject: "123", isVerified: true }) });
  });

  it("never promotes a normal Telegram beta user and never downgrades an existing staff user", async () => {
    await upsertTelegramUser({ telegramId: 123n, username: "friend" }, "999");
    const call = mocks.prisma.user.upsert.mock.calls[0]![0];
    expect(call.create.systemRole).toBe(SystemRole.USER);
    expect(call.update).not.toHaveProperty("systemRole");
  });

  it("preserves the explicitly configured existing Super Admin bootstrap", async () => {
    await upsertTelegramUser({ telegramId: 999n }, "999");
    expect(mocks.prisma.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ systemRole: SystemRole.SUPER_ADMIN }),
      create: expect.objectContaining({ systemRole: SystemRole.SUPER_ADMIN }),
    }));
  });
});
