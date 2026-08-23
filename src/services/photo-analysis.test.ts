import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoAnalysisStatus, PhotoView } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const tx = {
    progressPhotoAnalysis: { upsert: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    progressPhotoSet: { findUnique: vi.fn(), findFirst: vi.fn() },
    progressPhotoAnalysis: { upsert: vi.fn() },
    $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
  };
  const logAIEventSuccess = vi.fn();
  const logAIEventError = vi.fn();
  return { prisma, tx, logAIEventSuccess, logAIEventError };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("./ai-events.js", () => ({
  logAIEventSuccess: mocks.logAIEventSuccess,
  logAIEventError: mocks.logAIEventError,
}));

import { analyzeProgressPhotoSet, VisionAnalysisError } from "./photo-analysis.js";

const safeResult = {
  overallSummary: "يظهر تغير بسيط بشكل تقريبي.",
  frontSummary: "الزاوية الأمامية متقاربة.",
  sideSummary: null,
  backSummary: null,
  symmetryNotes: null,
  postureNotes: null,
  muscularityNotes: "يظهر وضوح بسيط بالكتفين.",
  leannessNotes: "يبدو مستوى الدهون أقل مقارنة بالسابق.",
  comparisonSummary: null,
  confidenceLabel: "MEDIUM" as const,
};

function photoSet(allowVisionAnalysis: boolean) {
  return {
    id: "set-1",
    userId: "user-1",
    gymId: "gym-1",
    capturedAt: new Date("2026-08-20T10:00:00Z"),
    analysisRequested: true,
    photos: [{
      view: PhotoView.FRONT,
      media: {
        telegramFileId: "telegram-file",
        storageKey: null,
        mimeType: "image/jpeg",
        sizeBytes: 100n,
      },
    }],
    user: { profile: { allowVisionAnalysis } },
  };
}

const storage = {
  saveFromTelegram: vi.fn(),
  getReadableReference: vi.fn(async () => ({
    kind: "data_url" as const,
    dataUrl: "data:image/jpeg;base64,AA==",
    mimeType: "image/jpeg",
  })),
  delete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
});

describe("progress photo analysis orchestration", () => {
  it("blocks analysis when vision consent is false", async () => {
    mocks.prisma.progressPhotoSet.findUnique.mockResolvedValue(photoSet(false));
    mocks.prisma.progressPhotoAnalysis.upsert.mockResolvedValue({ status: PhotoAnalysisStatus.SKIPPED });
    const analyzer = { analyze: vi.fn() };
    const result = await analyzeProgressPhotoSet({ photoSetId: "set-1", storage, analyzer });
    expect(result.status).toBe(PhotoAnalysisStatus.SKIPPED);
    expect(analyzer.analyze).not.toHaveBeenCalled();
    expect(storage.getReadableReference).not.toHaveBeenCalled();
  });

  it("allows analysis with consent and records success without image bytes", async () => {
    mocks.prisma.progressPhotoSet.findUnique.mockResolvedValue(photoSet(true));
    mocks.prisma.progressPhotoSet.findFirst.mockResolvedValue(null);
    mocks.tx.progressPhotoAnalysis.update.mockImplementation(async ({ data }) => ({
      id: "analysis-1",
      ...data,
    }));
    const analyzer = {
      analyze: vi.fn(async () => ({ analysis: safeResult, model: "vision-model", inputTokens: 10, outputTokens: 20 })),
    };
    const result = await analyzeProgressPhotoSet({ photoSetId: "set-1", storage, analyzer });
    expect(result.status).toBe(PhotoAnalysisStatus.COMPLETED);
    expect(mocks.logAIEventSuccess).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "VISION_PROGRESS_ANALYSIS",
      model: "vision-model",
      inputSummary: expect.not.stringContaining("data:image"),
      outputSummary: safeResult.overallSummary,
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "VISION_ANALYSIS_COMPLETED" }),
    });
  });

  it("persists FAILED status and an AIEvent error when vision fails", async () => {
    mocks.prisma.progressPhotoSet.findUnique.mockResolvedValue(photoSet(true));
    mocks.prisma.progressPhotoSet.findFirst.mockResolvedValue(null);
    mocks.tx.progressPhotoAnalysis.update.mockImplementation(async ({ data }) => ({
      id: "analysis-1",
      ...data,
    }));
    const analyzer = { analyze: vi.fn(async () => { throw new Error("vision unavailable"); }) };
    await expect(analyzeProgressPhotoSet({ photoSetId: "set-1", storage, analyzer }))
      .rejects.toBeInstanceOf(VisionAnalysisError);
    expect(mocks.tx.progressPhotoAnalysis.update).toHaveBeenCalledWith({
      where: { photoSetId: "set-1" },
      data: expect.objectContaining({ status: PhotoAnalysisStatus.FAILED }),
    });
    expect(mocks.logAIEventError).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "VISION_PROGRESS_ANALYSIS",
      errorMessage: "vision unavailable",
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "VISION_ANALYSIS_FAILED" }),
    });
  });
});
