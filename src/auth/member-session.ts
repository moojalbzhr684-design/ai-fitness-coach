import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { MembershipStatus } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export const MEMBER_SESSION_COOKIE = "afc_member_session";
export const MEMBER_CSRF_COOKIE = "afc_member_csrf";
export const MEMBER_CSRF_HEADER = "x-csrf-token";

export class MemberAuthenticationError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "CSRF_INVALID" | "GYM_SELECTION_REQUIRED" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "MemberAuthenticationError";
  }
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeTokenEqual(rawValue: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOpaqueToken(rawValue));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createMemberSession(
  userId: string,
  database: typeof prisma = prisma,
  now = new Date(),
) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + env.MEMBER_SESSION_DAYS * 86_400_000);
  const session = await database.authSession.create({
    data: {
      userId,
      tokenHash: hashOpaqueToken(token),
      csrfTokenHash: hashOpaqueToken(csrfToken),
      expiresAt,
    },
    select: { id: true, userId: true, expiresAt: true },
  });
  return { ...session, token, csrfToken };
}

export async function authenticateMemberToken(token: string | undefined, now = new Date()) {
  if (!token || token.length < 32 || token.length > 256) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      user: {
        include: {
          profile: true,
          identities: true,
          gymMemberships: {
            where: { status: MembershipStatus.ACTIVE, gym: { isActive: true } },
            include: { gym: { include: { settings: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  if (!session.lastUsedAt || now.getTime() - session.lastUsedAt.getTime() > 5 * 60_000) {
    await prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastUsedAt: now },
    });
  }
  return session;
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function bearerValue(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match?.[1];
}

export async function authenticateMemberRequest(request: FastifyRequest) {
  const bearer = bearerValue(request.headers.authorization);
  const cookie = cookieValue(request.headers.cookie, MEMBER_SESSION_COOKIE);
  const token = bearer ?? cookie;
  const session = await authenticateMemberToken(token);
  if (!session) throw new MemberAuthenticationError("UNAUTHENTICATED", "Authentication required");
  return { session, token: token!, mode: bearer ? ("bearer" as const) : ("cookie" as const) };
}

export function requireMutationCsrf(
  request: FastifyRequest,
  auth: Awaited<ReturnType<typeof authenticateMemberRequest>>,
): void {
  if (auth.mode === "bearer") return;
  const supplied = request.headers[MEMBER_CSRF_HEADER];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  if (!value || !safeTokenEqual(value, auth.session.csrfTokenHash)) {
    throw new MemberAuthenticationError("CSRF_INVALID", "CSRF verification failed");
  }
}

export async function revokeMemberSession(sessionId: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateMemberCsrfToken(sessionId: string) {
  const csrfToken = randomBytes(24).toString("base64url");
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { csrfTokenHash: hashOpaqueToken(csrfToken) },
  });
  if (result.count !== 1) throw new MemberAuthenticationError("UNAUTHENTICATED", "Session is unavailable");
  return csrfToken;
}

export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}

export function memberSessionCookie(token: string, expiresAt: Date): string {
  const parts = [
    `${MEMBER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearMemberSessionCookie(): string {
  const parts = [
    `${MEMBER_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function memberCsrfCookie(csrfToken: string, expiresAt: Date): string {
  const parts = [
    `${MEMBER_CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
    "Path=/",
    "SameSite=Strict",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearMemberCsrfCookie(): string {
  const parts = [
    `${MEMBER_CSRF_COOKIE}=`,
    "Path=/",
    "SameSite=Strict",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}
