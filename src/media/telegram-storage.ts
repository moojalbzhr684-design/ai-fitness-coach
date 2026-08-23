import type { Api } from "grammy";
import { env } from "../config/env.js";
import { MediaStorageError, type MediaStorage } from "./storage.js";
import {
  MAX_PROGRESS_PHOTO_BYTES,
  type PrivateMediaRecord,
  type ReadableMediaReference,
  type StoredMediaReference,
  type TelegramPhotoInput,
} from "./types.js";

function validPositiveInteger(value: number | undefined): number | null {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export class TelegramMediaStorage implements MediaStorage {
  constructor(
    private readonly api: Api,
    private readonly botToken = env.TELEGRAM_BOT_TOKEN,
    private readonly maxBytes = MAX_PROGRESS_PHOTO_BYTES,
  ) {}

  async saveFromTelegram(input: TelegramPhotoInput): Promise<StoredMediaReference> {
    const fileId = input.fileId.trim();
    if (!fileId) {
      throw new MediaStorageError("INVALID_MEDIA", "Telegram file ID is required");
    }
    const fileSize = validPositiveInteger(input.fileSize);
    if (fileSize !== null && fileSize > this.maxBytes) {
      throw new MediaStorageError("MEDIA_TOO_LARGE", "Progress photo exceeds the size limit");
    }
    return {
      telegramFileId: fileId,
      storageKey: null,
      mimeType: input.mimeType?.trim() || "image/jpeg",
      sizeBytes: fileSize === null ? null : BigInt(fileSize),
      width: validPositiveInteger(input.width),
      height: validPositiveInteger(input.height),
    };
  }

  async getReadableReference(media: PrivateMediaRecord): Promise<ReadableMediaReference> {
    if (!media.telegramFileId) {
      throw new MediaStorageError("MEDIA_UNAVAILABLE", "Telegram media reference is missing");
    }
    if (media.sizeBytes !== null && media.sizeBytes > BigInt(this.maxBytes)) {
      throw new MediaStorageError("MEDIA_TOO_LARGE", "Progress photo exceeds the size limit");
    }
    const file = await this.api.getFile(media.telegramFileId);
    if (!file.file_path) {
      throw new MediaStorageError("MEDIA_UNAVAILABLE", "Telegram file path is unavailable");
    }
    const response = await fetch(
      `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`,
      { redirect: "error" },
    );
    if (!response.ok) {
      throw new MediaStorageError("MEDIA_UNAVAILABLE", "Telegram file download failed");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
      throw new MediaStorageError("MEDIA_TOO_LARGE", "Progress photo exceeds the size limit");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.maxBytes) {
      throw new MediaStorageError("MEDIA_TOO_LARGE", "Progress photo exceeds the size limit");
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]
      || media.mimeType
      || "image/jpeg";
    return {
      kind: "data_url",
      dataUrl: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
      mimeType,
    };
  }

  async delete(_media: PrivateMediaRecord): Promise<void> {
    // Telegram's Bot API does not provide remote file deletion. Deleting the private
    // database reference makes the file unreachable through this application.
  }
}
