import { describe, expect, it } from "vitest";
import {
  DASHBOARD_SESSION_MAX_AGE_SECONDS,
  createDashboardSession,
  dashboardSessionCookieOptions,
  verifyDashboardSession,
} from "./session.js";

const secret = "a-development-session-secret-with-32-chars";

describe("dashboard signed sessions", () => {
  it("round-trips an authenticated actor without browser role claims", () => {
    const token = createDashboardSession("actor-1", secret, 1_000);
    expect(verifyDashboardSession(token, secret, 2_000)).toEqual({
      actorUserId: "actor-1",
      expiresAt: 1_000 + DASHBOARD_SESSION_MAX_AGE_SECONDS * 1_000,
    });
  });

  it("rejects tampering, the wrong secret and expiration", () => {
    const token = createDashboardSession("actor-1", secret, 1_000);
    expect(verifyDashboardSession(`${token}x`, secret, 2_000)).toBeNull();
    expect(verifyDashboardSession(token, "a-different-development-secret-32-chars", 2_000)).toBeNull();
    expect(verifyDashboardSession(token, secret, 1_000 + DASHBOARD_SESSION_MAX_AGE_SECONDS * 1_000)).toBeNull();
  });

  it("uses secure HTTP-only production cookie settings", () => {
    expect(dashboardSessionCookieOptions(true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  });
});
