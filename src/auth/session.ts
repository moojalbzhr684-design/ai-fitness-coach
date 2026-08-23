import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const DASHBOARD_SESSION_COOKIE = "afc_dashboard_session";
export const DASHBOARD_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const sessionPayloadSchema = z.object({
  actorUserId: z.string().min(1).max(64),
  expiresAt: z.number().int().positive(),
}).strict();

export type DashboardSession = z.infer<typeof sessionPayloadSchema>;

function assertSecret(secret: string): void {
  if (secret.length < 32) throw new Error("Dashboard session secret must be at least 32 characters");
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createDashboardSession(
  actorUserId: string,
  secret: string,
  now = Date.now(),
): string {
  assertSecret(secret);
  const payload: DashboardSession = {
    actorUserId,
    expiresAt: now + DASHBOARD_SESSION_MAX_AGE_SECONDS * 1_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyDashboardSession(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): DashboardSession | null {
  if (!value) return null;
  assertSecret(secret);
  const [encoded, suppliedSignature, extra] = value.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expected = signature(encoded, secret);
  const suppliedBytes = Buffer.from(suppliedSignature);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  try {
    const parsed = sessionPayloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.expiresAt <= now) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function dashboardSessionCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DASHBOARD_SESSION_MAX_AGE_SECONDS,
  };
}
