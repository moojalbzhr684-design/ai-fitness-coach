import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingStep, PhotoAnalysisStatus, PhotoView } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  findUserByTelegramId: vi.fn(),
  getDraftProgressPhotoSet: vi.fn(),
  getLatestProgressPhotoSet: vi.fn(),
  getPhotoProgressSummary: vi.fn(),
  addTelegramProgressPhoto: vi.fn(),
  getOrCreateProgressPhotoSet: vi.fn(),
  deleteLatestProgressPhotoSet: vi.fn(),
  setPhotoPrivacyPreferences: vi.fn(),
  analyzeProgressPhotoSet: vi.fn(),
  getActiveGymMemberships: vi.fn(),
  resolveGymMembership: vi.fn(),
}));

vi.mock("../services/users.js", () => ({ findUserByTelegramId: mocks.findUserByTelegramId }));
vi.mock("../auth/gym-scope.js", () => ({
  getActiveGymMemberships: mocks.getActiveGymMemberships,
  resolveGymMembership: mocks.resolveGymMembership,
}));
vi.mock("../services/progress-photos.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/progress-photos.js")>();
  return {
    ...original,
    getDraftProgressPhotoSet: mocks.getDraftProgressPhotoSet,
    getLatestProgressPhotoSet: mocks.getLatestProgressPhotoSet,
    getPhotoProgressSummary: mocks.getPhotoProgressSummary,
    addTelegramProgressPhoto: mocks.addTelegramProgressPhoto,
    getOrCreateProgressPhotoSet: mocks.getOrCreateProgressPhotoSet,
    deleteLatestProgressPhotoSet: mocks.deleteLatestProgressPhotoSet,
    setPhotoPrivacyPreferences: mocks.setPhotoPrivacyPreferences,
  };
});
vi.mock("../services/photo-analysis.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/photo-analysis.js")>();
  return { ...original, analyzeProgressPhotoSet: mocks.analyzeProgressPhotoSet };
});

import {
  handleDeletePhotosCommand,
  handleLatestPhotosCommand,
  handlePhotoProgressCommand,
  handlePhotosCommand,
  handleProgressPhotoMessage,
} from "./photos.js";

function context(overrides: Record<string, unknown> = {}) {
  return {
    from: { id: 123 },
    api: {},
    reply: vi.fn(),
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUserByTelegramId.mockResolvedValue({
    id: "user-1",
    onboardingStep: OnboardingStep.COMPLETE,
  });
  mocks.getActiveGymMemberships.mockResolvedValue([]);
});

describe("Telegram progress photo commands", () => {
  it("/photos requires completed onboarding", async () => {
    mocks.findUserByTelegramId.mockResolvedValue({ id: "user-1", onboardingStep: OnboardingStep.AGE });
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handlePhotosCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("كمل الإعداد"));
  });

  it("/photos presents explicit analyze, storage-only, and cancel choices", async () => {
    mocks.getDraftProgressPhotoSet.mockResolvedValue(null);
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handlePhotosCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("التحليل مو تشخيص طبي"),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
  });

  it("persists an incoming Telegram photo and prompts the next view", async () => {
    mocks.getDraftProgressPhotoSet.mockResolvedValue({ id: "set-1" });
    mocks.addTelegramProgressPhoto.mockResolvedValue({
      view: PhotoView.FRONT,
      complete: false,
      shouldAnalyze: false,
      nextView: PhotoView.SIDE,
    });
    const ctx = context({
      message: {
        photo: [{ file_id: "file-1", file_unique_id: "unique-1", file_size: 1_000, width: 800, height: 1_200 }],
      },
    }) as { reply: ReturnType<typeof vi.fn> };
    await handleProgressPhotoMessage(ctx as never);
    expect(mocks.addTelegramProgressPhoto).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      photoSetId: "set-1",
      input: expect.objectContaining({ fileId: "file-1" }),
    }));
    expect(ctx.reply).toHaveBeenLastCalledWith(expect.stringContaining("SIDE"));
  });

  it("/latestphotos shows metadata without resending private photos", async () => {
    mocks.getLatestProgressPhotoSet.mockResolvedValue({
      capturedAt: new Date("2026-08-20T00:00:00Z"),
      weightKg: 78,
      waistCm: 84,
      photos: [{ view: PhotoView.FRONT }],
      analysis: { status: PhotoAnalysisStatus.COMPLETED, overallSummary: "ملخص آمن" },
    });
    const ctx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleLatestPhotosCommand(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("الصور الخاصة ما تنرسل تلقائياً"));
  });

  it("/photoprogress and /deletephotos provide summaries and confirmation", async () => {
    mocks.getPhotoProgressSummary.mockResolvedValue({
      count: 2,
      latest: { analysis: { overallSummary: "آخر تحليل", comparisonSummary: "مقارنة" } },
    });
    mocks.getLatestProgressPhotoSet.mockResolvedValue({ id: "set-2" });
    const progressCtx = context() as { reply: ReturnType<typeof vi.fn> };
    await handlePhotoProgressCommand(progressCtx as never);
    expect(progressCtx.reply).toHaveBeenCalledWith(expect.stringContaining("آخر تحليل"));
    const deleteCtx = context() as { reply: ReturnType<typeof vi.fn> };
    await handleDeletePhotosCommand(deleteCtx as never);
    expect(deleteCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining("متأكد"),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
  });
});
