import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { z } from "zod";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionCookieOptions,
  verifyDashboardSession,
} from "@core/auth/session";

const secretSchema = z.string().min(32);

function sessionSecret(): string {
  return secretSchema.parse(process.env.DASHBOARD_SESSION_SECRET);
}

export async function getSessionActorUserId(): Promise<string | null> {
  const store = await cookies();
  const session = verifyDashboardSession(store.get(DASHBOARD_SESSION_COOKIE)?.value, sessionSecret());
  return session?.actorUserId ?? null;
}

export async function requireSessionActorUserId(): Promise<string> {
  const actorUserId = await getSessionActorUserId();
  if (!actorUserId) {
    if (process.env.NODE_ENV === "production") notFound();
    redirect("/staff/login");
  }
  return actorUserId;
}

export function assertDevelopmentLoginEnabled() {
  if (process.env.NODE_ENV === "production") throw new Error("Development login is disabled in production");
  return {
    sessionSecret: sessionSecret(),
    loginToken: secretSchema.parse(process.env.DASHBOARD_DEV_LOGIN_TOKEN),
    telegramId: z.string().regex(/^\d+$/).parse(process.env.DASHBOARD_DEV_USER_TELEGRAM_ID),
  };
}

export function developmentTokenMatches(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function clearDashboardSession(): Promise<void> {
  const store = await cookies();
  store.set(DASHBOARD_SESSION_COOKIE, "", { ...dashboardSessionCookieOptions(process.env.NODE_ENV === "production"), maxAge: 0 });
}
