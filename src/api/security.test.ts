import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../config/env.js";
import { trustedClientIp } from "./security.js";

const originalSecret = env.MEMBER_PROXY_SECRET;

afterEach(() => { env.MEMBER_PROXY_SECRET = originalSecret; });

describe("trusted Web proxy client address", () => {
  it("accepts only an HMAC-signed server handoff", () => {
    const secret = "proxy-secret-with-at-least-thirty-two-characters";
    const ip = "198.51.100.24";
    env.MEMBER_PROXY_SECRET = secret;
    const signature = createHmac("sha256", secret).update(ip).digest("hex");
    expect(trustedClientIp({ ip: "10.0.0.8", headers: {
      "x-afc-proxy-ip": ip,
      "x-afc-proxy-signature": signature,
    } } as never)).toBe(ip);
  });

  it("rejects browser-forged or unsigned proxy identity", () => {
    env.MEMBER_PROXY_SECRET = "proxy-secret-with-at-least-thirty-two-characters";
    expect(trustedClientIp({ ip: "203.0.113.9", headers: {
      "x-afc-proxy-ip": "198.51.100.24",
      "x-afc-proxy-signature": "0".repeat(64),
    } } as never)).toBe("203.0.113.9");
    expect(trustedClientIp({ ip: "203.0.113.9", headers: {} } as never)).toBe("203.0.113.9");
  });
});
