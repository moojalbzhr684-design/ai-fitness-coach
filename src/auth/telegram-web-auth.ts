import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { upsertTelegramUser, type TelegramUserInput } from "../services/users.js";
import { createMemberSession, hashOpaqueToken, safeTokenEqual } from "./member-session.js";
import { authRateLimiter } from "./rate-limit.js";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export class TelegramWebAuthError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CHALLENGE"
      | "CHALLENGE_EXPIRED"
      | "CHALLENGE_USED"
      | "TELEGRAM_LOGIN_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "TelegramWebAuthError";
  }
}

function randomToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function configuredBotUsername(): string {
  const username = env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!username || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    throw new TelegramWebAuthError(
      "TELEGRAM_LOGIN_UNAVAILABLE",
      "Telegram login is temporarily unavailable",
    );
  }
  return username;
}

function assertToken(token: string): void {
  if (!TOKEN_PATTERN.test(token)) {
    throw new TelegramWebAuthError("INVALID_CHALLENGE", "The Telegram login request is invalid");
  }
}

export async function createTelegramWebLogin(input: { ip?: string; now?: Date }) {
  const now = input.now ?? new Date();
  const botUsername = configuredBotUsername();
  const requestIpHash = input.ip ? hashOpaqueToken(input.ip.trim()) : null;
  const windowMs = 15 * 60_000;
  authRateLimiter.consume(
    `telegram-login-request:${requestIpHash ?? "unknown"}`,
    env.AUTH_TELEGRAM_REQUESTS_PER_WINDOW,
    windowMs,
    now.getTime(),
  );
  const browserToken = randomToken();
  const botToken = randomToken();
  const expiresAt = new Date(now.getTime() + env.AUTH_TELEGRAM_EXPIRY_MINUTES * 60_000);
  const challenge = await prisma.telegramLoginChallenge.create({
    data: {
      browserTokenHash: hashOpaqueToken(browserToken),
      botTokenHash: hashOpaqueToken(botToken),
      requestIpHash,
      expiresAt,
    },
    select: { id: true },
  });
  return {
    challengeId: challenge.id,
    browserToken,
    expiresAt,
    telegramUrl: `https://t.me/${botUsername}?start=web_${botToken}`,
  };
}

export async function authorizeTelegramWebLogin(input: TelegramUserInput & { botToken: string; now?: Date }) {
  assertToken(input.botToken);
  const now = input.now ?? new Date();
  const challenge = await prisma.telegramLoginChallenge.findUnique({
    where: { botTokenHash: hashOpaqueToken(input.botToken) },
    select: { id: true, expiresAt: true, verifiedUserId: true, consumedAt: true },
  });
  if (!challenge) throw new TelegramWebAuthError("INVALID_CHALLENGE", "The Telegram login request is invalid");
  if (challenge.expiresAt <= now) throw new TelegramWebAuthError("CHALLENGE_EXPIRED", "The Telegram login request expired");
  if (challenge.consumedAt || challenge.verifiedUserId) {
    throw new TelegramWebAuthError("CHALLENGE_USED", "The Telegram login request was already used");
  }

  // Telegram supplies this identity. Browser-controlled fields never reach this boundary.
  const user = await upsertTelegramUser(
    {
      telegramId: input.telegramId,
      ...(input.username ? { username: input.username } : {}),
      ...(input.firstName ? { firstName: input.firstName } : {}),
      ...(input.lastName ? { lastName: input.lastName } : {}),
    },
    env.SUPER_ADMIN_TELEGRAM_ID,
  );
  await prisma.$transaction(async (tx) => {
    const database = tx as unknown as typeof prisma;
    const claimed = await database.telegramLoginChallenge.updateMany({
      where: {
        id: challenge.id,
        verifiedUserId: null,
        verifiedAt: null,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { verifiedUserId: user.id, verifiedAt: now },
    });
    if (claimed.count !== 1) {
      throw new TelegramWebAuthError("CHALLENGE_USED", "The Telegram login request was already used");
    }
    await database.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "TELEGRAM_WEB_LOGIN_VERIFIED",
        targetType: "TelegramLoginChallenge",
        targetId: challenge.id,
      },
    });
  });
  return { userId: user.id, onboardingStep: user.onboardingStep };
}

export async function consumeTelegramWebLogin(input: {
  challengeId: string;
  browserToken: string;
  ip?: string;
  now?: Date;
}) {
  assertToken(input.browserToken);
  const now = input.now ?? new Date();
  const requestIpHash = input.ip ? hashOpaqueToken(input.ip.trim()) : "unknown";
  authRateLimiter.consume(
    `telegram-login-poll:${requestIpHash}:${input.challengeId}`,
    env.AUTH_TELEGRAM_POLLS_PER_WINDOW,
    10 * 60_000,
    now.getTime(),
  );
  const challenge = await prisma.telegramLoginChallenge.findUnique({
    where: { id: input.challengeId },
    select: {
      id: true,
      browserTokenHash: true,
      verifiedUserId: true,
      expiresAt: true,
      consumedAt: true,
    },
  });
  if (!challenge || !safeTokenEqual(input.browserToken, challenge.browserTokenHash)) {
    throw new TelegramWebAuthError("INVALID_CHALLENGE", "The Telegram login request is invalid");
  }
  if (challenge.expiresAt <= now) {
    throw new TelegramWebAuthError("CHALLENGE_EXPIRED", "The Telegram login request expired");
  }
  if (challenge.consumedAt) {
    throw new TelegramWebAuthError("CHALLENGE_USED", "The Telegram login request was already used");
  }
  if (!challenge.verifiedUserId) return { status: "PENDING" as const, expiresAt: challenge.expiresAt };

  return prisma.$transaction(async (tx) => {
    const database = tx as unknown as typeof prisma;
    const consumed = await database.telegramLoginChallenge.updateMany({
      where: {
        id: challenge.id,
        verifiedUserId: challenge.verifiedUserId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new TelegramWebAuthError("CHALLENGE_USED", "The Telegram login request was already used");
    }
    const session = await createMemberSession(challenge.verifiedUserId!, database, now);
    await database.auditLog.create({
      data: {
        actorUserId: challenge.verifiedUserId,
        action: "MEMBER_SESSION_CREATED_FROM_TELEGRAM",
        targetType: "AuthSession",
        targetId: session.id,
      },
    });
    return { status: "VERIFIED" as const, session };
  });
}
