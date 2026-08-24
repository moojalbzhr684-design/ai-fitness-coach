import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, RateLimitError } from "./rate-limit.js";

describe("fixed-window security rate limiter", () => {
  it("limits one key without affecting another and resets after the window", () => {
    const limiter = new FixedWindowRateLimiter();
    limiter.consume("member-a", 2, 1_000, 10_000);
    limiter.consume("member-a", 2, 1_000, 10_100);
    expect(() => limiter.consume("member-a", 2, 1_000, 10_200)).toThrow(RateLimitError);
    expect(() => limiter.consume("member-b", 2, 1_000, 10_200)).not.toThrow();
    expect(() => limiter.consume("member-a", 2, 1_000, 11_001)).not.toThrow();
  });
});
