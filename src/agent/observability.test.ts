import { describe, expect, it } from "vitest";
import { safeToolSummary } from "./observability.js";

describe("Agent observability sanitization", () => {
  it("removes credentials, raw image references, and hidden reasoning fields", () => {
    const summary = safeToolSummary({
      tool: "safe_tool",
      apiKey: "sk-private",
      password: "db-password",
      telegramFileId: "telegram-private",
      storageKey: "private/path.jpg",
      rawImage: "bytes",
      chainOfThought: "hidden",
      reasoning: "hidden",
      output: { value: 42 },
    });
    expect(summary).toContain("safe_tool");
    expect(summary).toContain("42");
    expect(summary).not.toMatch(/sk-private|db-password|telegram-private|private\/path|chainOfThought|reasoning|hidden/);
  });

  it("bounds deeply nested and oversized values", () => {
    const summary = safeToolSummary({ text: "x".repeat(5_000), nested: { a: { b: { c: { d: "private" } } } } });
    expect(summary.length).toBeLessThanOrEqual(2_000);
    expect(summary).toContain("[truncated]");
  });
});
