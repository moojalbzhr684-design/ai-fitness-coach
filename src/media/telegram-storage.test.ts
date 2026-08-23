import { describe, expect, it, vi } from "vitest";
import { TelegramMediaStorage } from "./telegram-storage.js";
import { MAX_PROGRESS_PHOTO_BYTES } from "./types.js";

describe("Telegram media storage", () => {
  it("retains a private Telegram reference and metadata without downloading", async () => {
    const api = { getFile: vi.fn() };
    const storage = new TelegramMediaStorage(api as never, "test-token");
    const stored = await storage.saveFromTelegram({
      fileId: "telegram-file-id",
      fileSize: 1_024,
      width: 1_280,
      height: 1_920,
    });
    expect(stored).toEqual(expect.objectContaining({
      telegramFileId: "telegram-file-id",
      sizeBytes: 1_024n,
      width: 1_280,
      height: 1_920,
    }));
    expect(api.getFile).not.toHaveBeenCalled();
  });

  it("rejects oversized photo metadata before download", async () => {
    const storage = new TelegramMediaStorage({ getFile: vi.fn() } as never, "test-token");
    await expect(storage.saveFromTelegram({
      fileId: "telegram-file-id",
      fileSize: MAX_PROGRESS_PHOTO_BYTES + 1,
    })).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });
  });

  it("requires a Telegram file ID", async () => {
    const storage = new TelegramMediaStorage({ getFile: vi.fn() } as never, "test-token");
    await expect(storage.saveFromTelegram({ fileId: " " }))
      .rejects.toMatchObject({ code: "INVALID_MEDIA" });
  });
});
