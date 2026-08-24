import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    telegramLoginChallenge: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    authSession: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma, upsertTelegramUser: vi.fn() };
});

vi.mock("../config/env.js", () => ({ env: {
  TELEGRAM_BOT_USERNAME: "fitness_beta_bot",
  SUPER_ADMIN_TELEGRAM_ID: "999",
  MEMBER_SESSION_DAYS: 30,
  AUTH_TELEGRAM_EXPIRY_MINUTES: 8,
  AUTH_TELEGRAM_REQUESTS_PER_WINDOW: 3,
  AUTH_TELEGRAM_POLLS_PER_WINDOW: 10,
} }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../services/users.js", () => ({ upsertTelegramUser: mocks.upsertTelegramUser }));

import { authRateLimiter } from "./rate-limit.js";
import { hashOpaqueToken } from "./member-session.js";
import {
  authorizeTelegramWebLogin,
  consumeTelegramWebLogin,
  createTelegramWebLogin,
} from "./telegram-web-auth.js";

const now = new Date("2026-08-24T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  authRateLimiter.reset();
  mocks.prisma.$transaction.mockImplementation(async (callback: (database: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  mocks.prisma.telegramLoginChallenge.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "challenge-a", ...data }));
  mocks.prisma.telegramLoginChallenge.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.authSession.create.mockResolvedValue({ id: "session-a", userId: "member-a", expiresAt: new Date("2026-09-23T10:00:00Z") });
  mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit-a" });
  mocks.upsertTelegramUser.mockResolvedValue({ id: "member-a", onboardingStep: "AGE", systemRole: "USER" });
});

async function challenge() {
  const created = await createTelegramWebLogin({ ip: "198.51.100.10", now });
  const botToken = new URL(created.telegramUrl).searchParams.get("start")!.slice(4);
  const data = mocks.prisma.telegramLoginChallenge.create.mock.calls.at(-1)![0].data;
  return { created, botToken, data };
}

describe("Telegram-linked web login", () => {
  it("stores two different token hashes and exposes no Telegram bot secret", async () => {
    const { created, botToken, data } = await challenge();
    expect(created.telegramUrl).toBe(`https://t.me/fitness_beta_bot?start=web_${botToken}`);
    expect(data.browserTokenHash).toBe(hashOpaqueToken(created.browserToken));
    expect(data.botTokenHash).toBe(hashOpaqueToken(botToken));
    expect(data.browserTokenHash).not.toBe(data.botTokenHash);
    expect(JSON.stringify(created)).not.toContain("TELEGRAM_BOT_TOKEN");
  });

  it("binds identity only from Telegram and cannot accept a browser user ID", async () => {
    const { botToken } = await challenge();
    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValue({
      id: "challenge-a", expiresAt: new Date("2026-08-24T10:08:00Z"), verifiedUserId: null, consumedAt: null,
    });
    await authorizeTelegramWebLogin({
      botToken,
      telegramId: 123n,
      username: "member",
      now: new Date("2026-08-24T10:01:00Z"),
      ...({ userId: "attacker", systemRole: "SUPER_ADMIN" } as Record<string, unknown>),
    });
    expect(mocks.upsertTelegramUser).toHaveBeenCalledWith(
      { telegramId: 123n, username: "member" },
      "999",
    );
    expect(mocks.prisma.telegramLoginChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ verifiedUserId: null, consumedAt: null }),
      data: { verifiedUserId: "member-a", verifiedAt: expect.any(Date) },
    }));
  });

  it("returns pending, then creates one opaque session and prevents replay", async () => {
    const { created, data } = await challenge();
    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValueOnce({
      id: "challenge-a", browserTokenHash: data.browserTokenHash, verifiedUserId: null,
      expiresAt: new Date("2026-08-24T10:08:00Z"), consumedAt: null,
    });
    await expect(consumeTelegramWebLogin({ ...created, ip: "198.51.100.10", now: new Date("2026-08-24T10:01:00Z") })).resolves.toMatchObject({ status: "PENDING" });

    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValueOnce({
      id: "challenge-a", browserTokenHash: data.browserTokenHash, verifiedUserId: "member-a",
      expiresAt: new Date("2026-08-24T10:08:00Z"), consumedAt: null,
    });
    const verified = await consumeTelegramWebLogin({ ...created, ip: "198.51.100.10", now: new Date("2026-08-24T10:02:00Z") });
    expect(verified).toMatchObject({ status: "VERIFIED", session: { id: "session-a", userId: "member-a" } });
    expect(verified.status === "VERIFIED" && verified.session.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(mocks.prisma.authSession.create.mock.calls[0]![0].data.tokenHash).not.toBe(verified.status === "VERIFIED" ? verified.session.token : "");

    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValueOnce({
      id: "challenge-a", browserTokenHash: data.browserTokenHash, verifiedUserId: "member-a",
      expiresAt: new Date("2026-08-24T10:08:00Z"), consumedAt: new Date("2026-08-24T10:02:00Z"),
    });
    await expect(consumeTelegramWebLogin({ ...created, ip: "198.51.100.10", now: new Date("2026-08-24T10:03:00Z") })).rejects.toMatchObject({ code: "CHALLENGE_USED" });
    expect(mocks.prisma.authSession.create).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong browser capabilities, expired challenges, and bot replay", async () => {
    const { created, botToken, data } = await challenge();
    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValueOnce({
      id: "challenge-a", browserTokenHash: data.browserTokenHash, verifiedUserId: null,
      expiresAt: new Date("2026-08-24T10:08:00Z"), consumedAt: null,
    });
    await expect(consumeTelegramWebLogin({ challengeId: created.challengeId, browserToken: "x".repeat(43), now })).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });
    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValueOnce({
      id: "challenge-a", browserTokenHash: data.browserTokenHash, verifiedUserId: null,
      expiresAt: new Date("2026-08-24T09:59:00Z"), consumedAt: null,
    });
    await expect(consumeTelegramWebLogin({ ...created, now })).rejects.toMatchObject({ code: "CHALLENGE_EXPIRED" });
    mocks.prisma.telegramLoginChallenge.findUnique.mockResolvedValueOnce({
      id: "challenge-a", expiresAt: new Date("2026-08-24T10:08:00Z"), verifiedUserId: "member-a", consumedAt: null,
    });
    await expect(authorizeTelegramWebLogin({ botToken, telegramId: 123n, now })).rejects.toMatchObject({ code: "CHALLENGE_USED" });
  });

  it("rate-limits challenge creation by request IP", async () => {
    for (let index = 0; index < 3; index += 1) await createTelegramWebLogin({ ip: "203.0.113.8", now });
    await expect(createTelegramWebLogin({ ip: "203.0.113.8", now })).rejects.toMatchObject({ name: "RateLimitError" });
  });
});
