import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), consume: vi.fn() }));

vi.mock("../auth/telegram-web-auth.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auth/telegram-web-auth.js")>();
  return {
    ...original,
    createTelegramWebLogin: mocks.create,
    consumeTelegramWebLogin: mocks.consume,
  };
});

import { createApiServer } from "./server.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({
    challengeId: "challenge-a",
    browserToken: "b".repeat(43),
    expiresAt: new Date("2026-08-24T10:08:00Z"),
    telegramUrl: `https://t.me/fitness_beta_bot?start=web_${"t".repeat(43)}`,
  });
  mocks.consume.mockResolvedValue({
    status: "VERIFIED",
    session: {
      id: "session-a",
      userId: "member-a",
      token: "s".repeat(43),
      csrfToken: "c".repeat(32),
      expiresAt: new Date("2026-09-24T10:00:00Z"),
    },
  });
});

describe("Telegram web login API", () => {
  it("rejects browser-supplied identity and role fields", async () => {
    const app = createApiServer({ logger: false });
    const request = await app.inject({
      method: "POST",
      url: "/api/v1/auth/telegram/request",
      payload: { userId: "victim", systemRole: "SUPER_ADMIN" },
    });
    expect(request.statusCode).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();

    const status = await app.inject({
      method: "POST",
      url: "/api/v1/auth/telegram/status",
      payload: { challengeId: "challenge-a", browserToken: "b".repeat(43), telegramUserId: "123" },
    });
    expect(status.statusCode).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
    await app.close();
  });

  it("issues secure web cookies only after the verified challenge is consumed", async () => {
    const app = createApiServer({ logger: false });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/telegram/status",
      payload: { challengeId: "challenge-a", browserToken: "b".repeat(43) },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { status: "VERIFIED", csrfToken: "c".repeat(32) } });
    const cookies = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"].join("; ")
      : response.headers["set-cookie"];
    expect(cookies).toContain("afc_member_session=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=Strict");
    expect(JSON.stringify(response.json())).not.toContain("s".repeat(43));
    await app.close();
  });
});
