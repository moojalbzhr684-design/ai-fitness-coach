import { describe, expect, it } from "vitest";
import { dashboardFilters, firstParam } from "./search-params";

describe("web search parameter normalization", () => {
  it("uses only the first repeated value", () => {
    expect(firstParam(["trusted", "ignored"])).toBe("trusted");
  });

  it("passes only pagination and search fields to generic queries", () => {
    expect(dashboardFilters({ page: "2", pageSize: "25", search: "member", role: "OWNER" })).toEqual({ page: "2", pageSize: "25", search: "member" });
  });
});
