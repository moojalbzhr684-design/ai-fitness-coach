import { describe, expect, it } from "vitest";
import { hashOtpCode, normalizeEmail, verifyOtpHash } from "./member-auth.js";

describe("member OTP primitives", () => {
  it("normalizes email and stores a salted non-plaintext code hash", () => {
    expect(normalizeEmail("  Member@Example.COM ")).toBe("member@example.com");
    const first = hashOtpCode("123456");
    const second = hashOtpCode("123456");
    expect(first).not.toContain("123456");
    expect(first).not.toBe(second);
    expect(verifyOtpHash("123456", first)).toBe(true);
    expect(verifyOtpHash("654321", first)).toBe(false);
  });

  it("rejects malformed email addresses", () => {
    expect(() => normalizeEmail("not-an-email")).toThrow();
  });
});
