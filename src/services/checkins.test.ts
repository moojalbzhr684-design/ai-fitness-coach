import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActivityLevel,
  CheckInStatus,
  CheckInStep,
  Goal,
  OnboardingStep,
  Sex,
} from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => {
  const tx = {
    weeklyCheckIn: { findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    workoutSession: { count: vi.fn() },
    bodyMeasurement: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    userProfile: { update: vi.fn() },
    nutritionPlan: { findFirst: vi.fn() },
    progressEvaluation: { create: vi.fn() },
    agentDecision: { create: vi.fn() },
    auditLog: { createMany: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    weeklyCheckIn: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (store: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
});

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { completeDraftCheckIn, getOrCreateDraftCheckIn } from "./checkins.js";

const createdAt = new Date("2026-08-01T08:00:00Z");
const completeDraft = {
  id: "checkin-1",
  userId: "user-1",
  gymId: null,
  status: CheckInStatus.DRAFT,
  currentStep: CheckInStep.COMPLETE,
  weightKg: 79,
  waistCm: 85,
  nutritionAdherencePct: 90,
  workoutsCompleted: 4,
  trackedWorkoutsCompleted: null,
  averageDailySteps: 8_000,
  averageSleepHours: 7,
  hungerRating: 5,
  energyRating: 7,
  notes: null,
  submittedAt: null,
  evaluatedAt: null,
  createdAt,
  updatedAt: createdAt,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("check-in persistence service", () => {
  it("resumes an existing draft instead of creating another", async () => {
    mocks.prisma.weeklyCheckIn.findFirst.mockResolvedValue(completeDraft);
    const result = await getOrCreateDraftCheckIn("user-1");
    expect(result).toEqual({ checkIn: completeDraft, resumed: true });
    expect(mocks.prisma.weeklyCheckIn.create).not.toHaveBeenCalled();
  });

  it("atomically creates measurement, updates profile, evaluation, decision, and audits", async () => {
    mocks.tx.weeklyCheckIn.findFirst.mockResolvedValue(completeDraft);
    mocks.tx.user.findUnique.mockResolvedValue({
      id: "user-1",
      onboardingStep: OnboardingStep.COMPLETE,
      profile: {
        age: 30,
        sex: Sex.MALE,
        heightCm: 180,
        weightKg: 80,
        activityLevel: ActivityLevel.MODERATE,
        goal: Goal.FAT_LOSS,
      },
      gymMemberships: [],
    });
    mocks.tx.workoutSession.count.mockResolvedValue(3);
    mocks.tx.weeklyCheckIn.update
      .mockResolvedValueOnce({ ...completeDraft, status: CheckInStatus.SUBMITTED })
      .mockResolvedValueOnce({ ...completeDraft, status: CheckInStatus.EVALUATED, trackedWorkoutsCompleted: 3 });
    mocks.tx.bodyMeasurement.create.mockResolvedValue({ id: "measurement-3" });
    mocks.tx.bodyMeasurement.findMany.mockResolvedValue([
      { weightKg: 80, measuredAt: new Date("2026-08-01T08:00:00Z") },
      { weightKg: 79.5, measuredAt: new Date("2026-08-08T08:00:00Z") },
      { weightKg: 79, measuredAt: new Date("2026-08-15T08:00:00Z") },
    ]);
    mocks.tx.nutritionPlan.findFirst.mockResolvedValue({ target: { calories: 2_200 } });
    mocks.tx.progressEvaluation.create.mockImplementation(async ({ data }) => ({ id: "evaluation-1", ...data }));
    mocks.tx.agentDecision.create.mockResolvedValue({ id: "decision-1" });
    mocks.tx.auditLog.createMany.mockResolvedValue({ count: 4 });

    const result = await completeDraftCheckIn("user-1");

    expect(mocks.tx.bodyMeasurement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", weightKg: 79, source: "WEEKLY_CHECKIN" }),
    });
    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { weightKg: 79 },
    });
    expect(mocks.tx.progressEvaluation.create).toHaveBeenCalledOnce();
    expect(mocks.tx.agentDecision.create).toHaveBeenCalledOnce();
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ action: "WEEKLY_CHECKIN_SUBMITTED" }),
        expect.objectContaining({ action: "PROGRESS_EVALUATED" }),
        expect.objectContaining({ action: "PROGRESS_RECOMMENDATION_CREATED" }),
      ]),
    });
    expect(mocks.tx.bodyMeasurement.deleteMany).not.toHaveBeenCalled();
    expect(result.checkIn.status).toBe(CheckInStatus.EVALUATED);
  });
});
