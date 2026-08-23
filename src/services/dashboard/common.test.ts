import { describe, expect, it } from "vitest";
import { conciseSafeMetadata, pageWindow, paginationSchema } from "./common.js";

describe("dashboard query validation", () => {
  it("defaults and caps server pagination", () => {
    const defaults = paginationSchema.parse({});
    expect(defaults).toEqual({ page: 1, pageSize: 25 });
    expect(pageWindow({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 });
    expect(() => paginationSchema.parse({ pageSize: 51 })).toThrow();
    expect(() => paginationSchema.parse({ search: "x".repeat(81) })).toThrow();
  });

  it("drops nested and oversized audit metadata", () => {
    expect(conciseSafeMetadata({ safe: true, nested: { secret: "hidden" }, text: "x".repeat(400) })).toEqual({ safe: true, text: "x".repeat(300) });
  });
});
