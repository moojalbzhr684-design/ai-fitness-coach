import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../app/manifest";
import { MemberApiError, redirectForMemberAuth } from "./member-api";

afterEach(() => vi.unstubAllGlobals());

describe("Member Web Portal regression", () => {
  it("ships every authenticated member route", () => {
    for (const route of ["", "coach", "workout", "nutrition", "progress", "photos", "profile", "login"]) {
      const path = resolve(process.cwd(), "app/app", route, "page.tsx");
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, "utf8")).toContain("export default");
    }
  });

  it("redirects an unauthenticated member to the isolated member login", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    expect(redirectForMemberAuth(new MemberApiError(401, "UNAUTHENTICATED", "required"))).toBe(true);
    expect(assign).toHaveBeenCalledWith("/app/login");
    expect(redirectForMemberAuth(new MemberApiError(403, "FORBIDDEN", "denied"))).toBe(false);
  });

  it("provides an installable member PWA foundation", () => {
    const value = manifest();
    expect(value).toMatchObject({ start_url: "/app", display: "standalone", theme_color: "#2563eb" });
    expect(value.icons?.[0]?.src).toBe("/member-icon.svg");
  });
});
