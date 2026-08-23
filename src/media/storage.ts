import type {
  PrivateMediaRecord,
  ReadableMediaReference,
  StoredMediaReference,
  TelegramPhotoInput,
} from "./types.js";

export class MediaStorageError extends Error {
  constructor(
    public readonly code: "INVALID_MEDIA" | "MEDIA_TOO_LARGE" | "MEDIA_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "MediaStorageError";
  }
}

export interface MediaStorage {
  saveFromTelegram(input: TelegramPhotoInput): Promise<StoredMediaReference>;
  getReadableReference(media: PrivateMediaRecord): Promise<ReadableMediaReference>;
  delete(media: PrivateMediaRecord): Promise<void>;
}
