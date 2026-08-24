import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { trustedIncomingIp } from "./proxy-security";
import { isProductionStaffPath, proxy } from "../proxy";

afterEach(() => vi.unstubAllEnvs());

describe("public beta Web security", () => {
  it("returns a real 404 for every production staff route", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/admin", "/admin/users", "/gym", "/trainer/members", "/staff/login"]) {
      expect(isProductionStaffPath(path, "production")).toBe(true);
      const response = proxy(new NextRequest(`https://beta.example${path}`));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(isProductionStaffPath("/app", "production")).toBe(false);
    expect(isProductionStaffPath("/admin", "development")).toBe(false);
  });

  it("uses Railway's client IP instead of a varying forwarded edge chain", () => {
    const request = new NextRequest("https://beta.example/api/v1/auth/telegram/request", {
      headers: {
        "x-real-ip": "203.0.113.42",
        "x-forwarded-for": "198.51.100.2, 192.0.2.9",
      },
    });
    expect(trustedIncomingIp(request.headers)).toBe("203.0.113.42");
  });

  it("rejects malformed client IP values before signing them", () => {
    const request = new NextRequest("https://beta.example/api/v1/auth/telegram/request", {
      headers: { "x-real-ip": "spoofed", "x-forwarded-for": "also-spoofed" },
    });
    expect(trustedIncomingIp(request.headers)).toBeNull();
  });
});
