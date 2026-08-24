import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { AuthChallengePurpose, IdentityProvider } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { createMemberSession } from "./member-session.js";
import { type EmailProvider, getEmailProvider } from "./email-provider.js";
import { authRateLimiter } from "./rate-limit.js";

export const OTP_CODE_LENGTH = 6;

export class MemberAuthError extends Error {
  constructor(
    public readonly code:
      | "INVALID_EMAIL"
      | "INVALID_CHALLENGE"
      | "ATTEMPTS_EXCEEDED"
      | "IDENTITY_CONFLICT"
      | "EMAIL_DELIVERY_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "MemberAuthError";
  }
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MemberAuthError("INVALID_EMAIL", "Enter a valid email address");
  }
  return email;
}

export function hashOtpCode(code: string, salt = randomBytes(16).toString("base64url")): string {
  const digest = scryptSync(code, salt, 32).toString("base64url");
  return `scrypt:${salt}:${digest}`;
}

export function verifyOtpHash(code: string, stored: string): boolean {
  const [algorithm, salt, digest] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const actual = scryptSync(code, salt, 32);
  const expected = Buffer.from(digest, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashRequestIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(ip.trim()).digest("hex");
}

export async function requestEmailLoginCode(input: {
  email: string;
  ip?: string;
  purpose?: AuthChallengePurpose;
  linkUserId?: string;
  provider?: EmailProvider;
  now?: Date;
}) {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  const purpose = input.purpose ?? AuthChallengePurpose.LOGIN;
  if (purpose === AuthChallengePurpose.LINK_IDENTITY && !input.linkUserId) {
    throw new MemberAuthError("INVALID_CHALLENGE", "An authenticated user is required for identity linking");
  }
  const ipHash = hashRequestIp(input.ip);
  const windowMs = env.AUTH_OTP_WINDOW_MINUTES * 60_000;
  authRateLimiter.consume(`otp-email:${email}`, env.AUTH_OTP_REQUESTS_PER_WINDOW, windowMs, now.getTime());
  if (ipHash) authRateLimiter.consume(`otp-ip:${ipHash}`, env.AUTH_OTP_REQUESTS_PER_WINDOW * 3, windowMs, now.getTime());

  const code = randomInt(0, 10 ** OTP_CODE_LENGTH).toString().padStart(OTP_CODE_LENGTH, "0");
  const challenge = await prisma.authChallenge.create({
    data: {
      email,
      codeHash: hashOtpCode(code),
      purpose,
      linkUserId: input.linkUserId ?? null,
      requestIpHash: ipHash ?? null,
      expiresAt: new Date(now.getTime() + env.AUTH_OTP_EXPIRY_MINUTES * 60_000),
    },
    select: { id: true, expiresAt: true },
  });
  try {
    await (input.provider ?? getEmailProvider()).sendLoginCode({
      email,
      code,
      expiresInMinutes: env.AUTH_OTP_EXPIRY_MINUTES,
    });
  } catch {
    await prisma.authChallenge.deleteMany({ where: { id: challenge.id, usedAt: null } });
    throw new MemberAuthError("EMAIL_DELIVERY_UNAVAILABLE", "Login email delivery is unavailable");
  }
  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt,
    message: "If the address can receive sign-in email, a code has been sent.",
  };
}

export async function verifyEmailLoginCode(input: {
  email: string;
  challengeId: string;
  code: string;
  expectedPurpose?: AuthChallengePurpose;
  authenticatedUserId?: string;
  now?: Date;
}) {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  if (!/^\d{6}$/.test(input.code) || input.challengeId.length > 100) {
    throw new MemberAuthError("INVALID_CHALLENGE", "The login code is invalid or expired");
  }
  const challenge = await prisma.authChallenge.findUnique({ where: { id: input.challengeId } });
  const purpose = input.expectedPurpose ?? AuthChallengePurpose.LOGIN;
  if (!challenge || challenge.email !== email || challenge.purpose !== purpose || challenge.usedAt
    || challenge.expiresAt <= now || challenge.attemptCount >= env.AUTH_OTP_MAX_ATTEMPTS
    || (purpose === AuthChallengePurpose.LINK_IDENTITY && challenge.linkUserId !== input.authenticatedUserId)) {
    throw new MemberAuthError(
      challenge?.attemptCount && challenge.attemptCount >= env.AUTH_OTP_MAX_ATTEMPTS ? "ATTEMPTS_EXCEEDED" : "INVALID_CHALLENGE",
      "The login code is invalid or expired",
    );
  }
  if (!verifyOtpHash(input.code, challenge.codeHash)) {
    await prisma.authChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, attemptCount: { lt: env.AUTH_OTP_MAX_ATTEMPTS } },
      data: { attemptCount: { increment: 1 } },
    });
    throw new MemberAuthError("INVALID_CHALLENGE", "The login code is invalid or expired");
  }

  return prisma.$transaction(async (tx) => {
    const database = tx as unknown as typeof prisma;
    const claimed = await database.authChallenge.updateMany({
      where: {
        id: challenge.id,
        email,
        purpose,
        usedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: env.AUTH_OTP_MAX_ATTEMPTS },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new MemberAuthError("INVALID_CHALLENGE", "The login code is invalid or expired");

    const existing = await database.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: IdentityProvider.EMAIL, providerSubject: email } },
    });
    let userId: string;
    if (purpose === AuthChallengePurpose.LINK_IDENTITY) {
      userId = input.authenticatedUserId!;
      if (existing && existing.userId !== userId) {
        throw new MemberAuthError("IDENTITY_CONFLICT", "This verified email is already linked to another account");
      }
    } else if (existing) {
      userId = existing.userId;
    } else {
      const created = await database.user.create({ data: { profile: { create: {} } }, select: { id: true } });
      userId = created.id;
    }

    if (existing) {
      await database.userIdentity.update({
        where: { id: existing.id },
        data: { email, isVerified: true, lastUsedAt: now },
      });
    } else {
      await database.userIdentity.create({
        data: {
          userId,
          provider: IdentityProvider.EMAIL,
          providerSubject: email,
          email,
          isVerified: true,
          lastUsedAt: now,
        },
      });
    }

    if (purpose === AuthChallengePurpose.LINK_IDENTITY) return { linked: true as const, userId };
    const session = await createMemberSession(userId, database, now);
    return { linked: false as const, userId, session };
  });
}
