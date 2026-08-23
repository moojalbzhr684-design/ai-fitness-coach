export const MAX_PROGRESS_PHOTO_BYTES = 10 * 1024 * 1024;

export interface TelegramPhotoInput {
  fileId: string;
  fileUniqueId?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface StoredMediaReference {
  telegramFileId: string;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: bigint | null;
  width: number | null;
  height: number | null;
}

export interface PrivateMediaRecord {
  telegramFileId: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: bigint | null;
}

export interface ReadableMediaReference {
  kind: "data_url";
  dataUrl: string;
  mimeType: string;
}
