import { PhotoAnalysisStatus } from "../generated/prisma/client.js";
import { env } from "../config/env.js";
import type { MediaStorage } from "../media/storage.js";
import { prisma } from "../lib/prisma.js";
import { logAIEventError, logAIEventSuccess } from "./ai-events.js";
import { safeErrorMessage, truncateText } from "../utils/text.js";
import { OpenAIVisionAnalyzer } from "../vision/analyzer.js";
import {
  visionAnalysisSchema,
  type VisionAnalyzerClient,
  type VisionImageInput,
} from "../vision/types.js";

export class VisionAnalysisError extends Error {
  constructor(message = "Progress photo analysis failed") {
    super(message);
    this.name = "VisionAnalysisError";
  }
}

const analysisPhotoInclude = {
  photos: {
    orderBy: { createdAt: "asc" as const },
    include: { media: true },
  },
  user: { include: { profile: true } },
} as const;

async function readableImages(
  photos: Array<{
    view: "FRONT" | "SIDE" | "BACK" | "OTHER";
    media: {
      telegramFileId: string | null;
      storageKey: string | null;
      mimeType: string | null;
      sizeBytes: bigint | null;
    };
  }>,
  storage: MediaStorage,
): Promise<VisionImageInput[]> {
  return Promise.all(photos.map(async (photo) => {
    const reference = await storage.getReadableReference(photo.media);
    return { view: photo.view, dataUrl: reference.dataUrl };
  }));
}

export async function analyzeProgressPhotoSet(params: {
  photoSetId: string;
  storage: MediaStorage;
  analyzer?: VisionAnalyzerClient;
}) {
  const photoSet = await prisma.progressPhotoSet.findUnique({
    where: { id: params.photoSetId },
    include: analysisPhotoInclude,
  });
  if (!photoSet) throw new VisionAnalysisError("Progress photo set not found");

  const consent = Boolean(photoSet.user.profile?.allowVisionAnalysis);
  if (!photoSet.analysisRequested || !consent) {
    return prisma.progressPhotoAnalysis.upsert({
      where: { photoSetId: photoSet.id },
      update: { status: PhotoAnalysisStatus.SKIPPED, errorMessage: null },
      create: {
        photoSetId: photoSet.id,
        userId: photoSet.userId,
        gymId: photoSet.gymId,
        status: PhotoAnalysisStatus.SKIPPED,
      },
    });
  }
  if (!photoSet.photos.length) throw new VisionAnalysisError("Progress photo set has no photos");

  const previous = await prisma.progressPhotoSet.findFirst({
    where: {
      userId: photoSet.userId,
      capturedAt: { lt: photoSet.capturedAt },
      analysis: { status: PhotoAnalysisStatus.COMPLETED },
    },
    include: analysisPhotoInclude,
    orderBy: { capturedAt: "desc" },
  });
  const analyzer = params.analyzer ?? new OpenAIVisionAnalyzer();
  const startedAt = Date.now();
  const inputSummary = `currentViews=${photoSet.photos.map((photo) => photo.view).join(",")}; previousSet=${previous ? "YES" : "NO"}`;

  await prisma.$transaction(async (tx) => {
    const transaction = tx as unknown as typeof prisma;
    await transaction.progressPhotoAnalysis.upsert({
      where: { photoSetId: photoSet.id },
      update: { status: PhotoAnalysisStatus.PENDING, errorMessage: null },
      create: {
        photoSetId: photoSet.id,
        userId: photoSet.userId,
        gymId: photoSet.gymId,
        status: PhotoAnalysisStatus.PENDING,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: photoSet.userId,
        gymId: photoSet.gymId,
        action: "VISION_ANALYSIS_STARTED",
        targetType: "ProgressPhotoSet",
        targetId: photoSet.id,
        metadata: { views: photoSet.photos.map((photo) => photo.view), hasPrevious: Boolean(previous) },
      },
    });
  });

  try {
    const [currentImages, previousImages] = await Promise.all([
      readableImages(photoSet.photos, params.storage),
      previous ? readableImages(previous.photos, params.storage) : Promise.resolve(undefined),
    ]);
    const response = await analyzer.analyze({
      current: currentImages,
      ...(previousImages?.length ? { previous: previousImages } : {}),
    });
    const result = visionAnalysisSchema.parse(response.analysis);
    const completed = await prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as typeof prisma;
      const analysis = await transaction.progressPhotoAnalysis.update({
        where: { photoSetId: photoSet.id },
        data: {
          status: PhotoAnalysisStatus.COMPLETED,
          model: response.model,
          overallSummary: result.overallSummary,
          frontSummary: result.frontSummary,
          sideSummary: result.sideSummary,
          backSummary: result.backSummary,
          symmetryNotes: result.symmetryNotes,
          postureNotes: result.postureNotes,
          muscularityNotes: result.muscularityNotes,
          leannessNotes: result.leannessNotes,
          comparisonSummary: result.comparisonSummary,
          confidenceLabel: result.confidenceLabel,
          errorMessage: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: photoSet.userId,
          gymId: photoSet.gymId,
          action: "VISION_ANALYSIS_COMPLETED",
          targetType: "ProgressPhotoAnalysis",
          targetId: analysis.id,
          metadata: { model: response.model, hasComparison: Boolean(result.comparisonSummary) },
        },
      });
      return analysis;
    });
    await logAIEventSuccess({
      userId: photoSet.userId,
      ...(photoSet.gymId ? { gymId: photoSet.gymId } : {}),
      eventType: "VISION_PROGRESS_ANALYSIS",
      model: response.model,
      latencyMs: Date.now() - startedAt,
      inputSummary,
      outputSummary: truncateText(result.overallSummary),
      ...(response.inputTokens !== undefined ? { inputTokens: response.inputTokens } : {}),
      ...(response.outputTokens !== undefined ? { outputTokens: response.outputTokens } : {}),
    });
    return completed;
  } catch (error) {
    const errorMessage = safeErrorMessage(error, [
      env.OPENAI_API_KEY ?? "",
      env.TELEGRAM_BOT_TOKEN,
      env.DATABASE_URL,
    ]);
    const failed = await prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as typeof prisma;
      const analysis = await transaction.progressPhotoAnalysis.update({
        where: { photoSetId: photoSet.id },
        data: {
          status: PhotoAnalysisStatus.FAILED,
          model: env.OPENAI_MODEL,
          errorMessage,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: photoSet.userId,
          gymId: photoSet.gymId,
          action: "VISION_ANALYSIS_FAILED",
          targetType: "ProgressPhotoAnalysis",
          targetId: analysis.id,
          metadata: { model: env.OPENAI_MODEL },
        },
      });
      return analysis;
    });
    await logAIEventError({
      userId: photoSet.userId,
      ...(photoSet.gymId ? { gymId: photoSet.gymId } : {}),
      eventType: "VISION_PROGRESS_ANALYSIS",
      model: env.OPENAI_MODEL,
      latencyMs: Date.now() - startedAt,
      inputSummary,
      errorMessage,
    });
    throw new VisionAnalysisError(failed.errorMessage ?? "Progress photo analysis failed");
  }
}
