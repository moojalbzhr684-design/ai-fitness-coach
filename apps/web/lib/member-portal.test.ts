import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../app/manifest";
import { MemberApiError, redirectForMemberAuth } from "./member-api";

afterEach(() => vi.unstubAllGlobals());

describe("Member Web Portal regression", () => {
  it("ships every authenticated member route", () => {
    for (const route of ["", "coach", "workout", "nutrition", "progress", "photos", "profile", "login", "onboarding"]) {
      const path = resolve(process.cwd(), "app/app", route, "page.tsx");
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, "utf8")).toContain("export default");
    }
  });

  it("redirects an unauthenticated member to the isolated member login", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    expect(redirectForMemberAuth(new MemberApiError(401, "UNAUTHENTICATED", "required"))).toBe(true);
    expect(assign).toHaveBeenCalledWith("/login");
    expect(redirectForMemberAuth(new MemberApiError(403, "FORBIDDEN", "denied"))).toBe(false);
  });

  it("ships a public Telegram beta login and keeps production staff login unavailable", () => {
    const publicLogin = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
    const staffLogin = readFileSync(resolve(process.cwd(), "app/staff/login/page.tsx"), "utf8");
    const proxy = readFileSync(resolve(process.cwd(), "app/api/v1/[...path]/route.ts"), "utf8");
    expect(publicLogin).toContain("TelegramLogin");
    expect(staffLogin).toContain('process.env.NODE_ENV === "production"');
    expect(staffLogin).toContain("notFound()");
    expect(proxy).toContain("process.env.BACKEND_API_URL");
    expect(proxy).not.toContain("NEXT_PUBLIC_BACKEND");
  });

  it("provides an installable member PWA foundation", () => {
    const value = manifest();
    expect(value).toMatchObject({ start_url: "/app", display: "standalone", theme_color: "#2563eb" });
    expect(value.icons?.[0]?.src).toBe("/member-icon.svg");
  });
});
