import { beforeEach, describe, expect, it, vi } from "vitest";
import { GymRole, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), csrf: vi.fn(), scope: vi.fn(),
  memberIdentity: vi.fn(), home: vi.fn(), workout: vi.fn(), nutrition: vi.fn(), progress: vi.fn(), photos: vi.fn(),
  currentWorkout: vi.fn(), nutritionTargets: vi.fn(), foodMacros: vi.fn(), alternatives: vi.fn(), checkIn: vi.fn(),
  deletePhotos: vi.fn(), weight: vi.fn(), submitCheckIn: vi.fn(), conversation: vi.fn(), runAgent: vi.fn(), toolExecute: vi.fn(),
  prisma: {
    userProfile: { updateMany: vi.fn(), findUnique: vi.fn() },
    authSession: { findMany: vi.fn() },
  },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../auth/member-session.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auth/member-session.js")>();
  return { ...original, authenticateMemberRequest: mocks.authenticate, requireMutationCsrf: mocks.csrf };
});
vi.mock("../auth/member-scope.js", () => ({ resolveMemberGymScope: mocks.scope }));
vi.mock("../services/member-api.js", () => ({
  getMemberIdentityPayload: mocks.memberIdentity,
  getMemberHomePayload: mocks.home,
  getMemberWorkoutPayload: mocks.workout,
  getMemberNutritionPayload: mocks.nutrition,
  getMemberProgressPayload: mocks.progress,
  getMemberPhotoMetadata: mocks.photos,
  currentWorkoutPayload: (value: unknown) => value,
}));
vi.mock("../services/workout-sessions.js", () => ({ getCurrentWorkoutSession: mocks.currentWorkout }));
vi.mock("../services/nutrition-plans.js", () => ({ getNutritionTargets: mocks.nutritionTargets }));
vi.mock("../services/foods.js", () => ({ getFoodMacrosByReference: mocks.foodMacros, getMealItemAlternatives: mocks.alternatives }));
vi.mock("../services/progress.js", () => ({ getCheckInStatus: mocks.checkIn }));
vi.mock("../services/progress-photos.js", () => ({ deleteMemberProgressPhotoSet: mocks.deletePhotos }));
vi.mock("../services/checkins.js", () => ({ logManualWeight: mocks.weight, submitStructuredCheckIn: mocks.submitCheckIn }));
vi.mock("../services/agent-conversations.js", () => ({ listAgentConversationMessages: mocks.conversation, runMemberAgentMessage: mocks.runAgent }));
vi.mock("../agent/registry.js", () => ({ agentToolRegistry: { execute: mocks.toolExecute } }));

import { MemberAuthenticationError } from "../auth/member-session.js";
import { createApiServer } from "./server.js";

const auth = {
  mode: "cookie" as const,
  token: "opaque",
  session: {
    id: "session-a",
    userId: "member-a",
    csrfTokenHash: "hash",
    user: { id: "member-a", systemRole: SystemRole.USER, gymMemberships: [{ gymId: "gym-a", role: GymRole.MEMBER }] },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue(auth);
  mocks.scope.mockReturnValue({ gymId: "gym-a", membership: auth.session.user.gymMemberships[0], memberships: auth.session.user.gymMemberships });
  mocks.memberIdentity.mockResolvedValue({ displayName: "Member" });
  mocks.home.mockResolvedValue({ greeting: "Member" });
  mocks.workout.mockResolvedValue({ program: null, current: null, recent: [] });
  mocks.nutrition.mockResolvedValue(null);
  mocks.progress.mockResolvedValue({ summary: null });
  mocks.photos.mockResolvedValue([]);
  mocks.conversation.mockResolvedValue({ conversation: null, messages: [] });
  mocks.runAgent.mockResolvedValue({ message: "جواب حقيقي", assistantMessage: { createdAt: new Date() } });
  mocks.toolExecute.mockResolvedValue({ status: "started" });
  mocks.weight.mockResolvedValue({ weightKg: 82.5, measuredAt: new Date() });
  mocks.checkIn.mockResolvedValue({ draft: null, latest: null });
  mocks.alternatives.mockResolvedValue(null);
  mocks.prisma.userProfile.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.userProfile.findUnique.mockResolvedValue({ userId: "member-a" });
});

describe("versioned Member API security", () => {
  it("returns the consistent 401 shape when unauthenticated", async () => {
    mocks.authenticate.mockRejectedValue(new MemberAuthenticationError("UNAUTHENTICATED", "required"));
    const app = createApiServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/v1/member/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication required" } });
    await app.close();
  });

  it("reads only the server-authenticated member profile and tenant", async () => {
    const app = createApiServer({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/v1/member/me", headers: { "x-gym-id": "gym-a" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.memberIdentity).toHaveBeenCalledWith("member-a", "gym-a");
    expect(response.json()).toEqual({ data: { displayName: "Member" } });
    await app.close();
  });

  it("rejects actorUserId injection and routes valid messages through the existing Agent boundary", async () => {
    const app = createApiServer({ logger: false });
    const forged = await app.inject({ method: "POST", url: "/api/v1/member/agent/message", payload: { message: "ابدأ", actorUserId: "victim" } });
    expect(forged.statusCode).toBe(400);
    expect(mocks.runAgent).not.toHaveBeenCalled();
    const valid = await app.inject({ method: "POST", url: "/api/v1/member/agent/message", payload: { message: "ابدأ تمريني" } });
    expect(valid.statusCode).toBe(200);
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-a", gymId: "gym-a", message: "ابدأ تمريني" }));
    await app.close();
  });

  it("blocks role mutation and rejects invalid workout sets before any tool executes", async () => {
    const app = createApiServer({ logger: false });
    const role = await app.inject({ method: "PATCH", url: "/api/v1/member/profile", payload: { systemRole: "SUPER_ADMIN", gymRole: "OWNER" } });
    expect(role.statusCode).toBe(400);
    const set = await app.inject({ method: "POST", url: "/api/v1/member/workout/set", payload: { exerciseReference: "1", setNumber: 0, weightKg: 60, reps: 10, rir: 2 } });
    expect(set.statusCode).toBe(400);
    expect(mocks.toolExecute).not.toHaveBeenCalled();
    await app.close();
  });

  it("provides no direct calorie mutation endpoint", async () => {
    const app = createApiServer({ logger: false });
    const response = await app.inject({ method: "POST", url: "/api/v1/member/nutrition/calories", payload: { calories: 1200 } });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("provides no member endpoints that create or promote staff memberships", async () => {
    const app = createApiServer({ logger: false });
    for (const url of [
      "/api/v1/member/role",
      "/api/v1/member/trainer-membership",
      "/api/v1/member/owner-membership",
    ]) {
      const response = await app.inject({ method: "POST", url, payload: { role: "OWNER", userId: "member-a" } });
      expect(response.statusCode).toBe(404);
    }
    await app.close();
  });

  it("executes workout actions with a server-built member actor and rejects foreign references", async () => {
    const app = createApiServer({ logger: false });
    const forged = await app.inject({ method: "POST", url: "/api/v1/member/workout/start", payload: { dayNumber: 1, userId: "victim", sessionId: "foreign" } });
    expect(forged.statusCode).toBe(400);
    const valid = await app.inject({ method: "POST", url: "/api/v1/member/workout/start", payload: { dayNumber: 1 } });
    expect(valid.statusCode).toBe(200);
    expect(mocks.toolExecute).toHaveBeenCalledWith("start_workout", { dayNumber: 1 }, expect.objectContaining({ actor: expect.objectContaining({ userId: "member-a", gymId: "gym-a", systemRole: SystemRole.USER, gymRole: GymRole.MEMBER }) }));
    await app.close();
  });

  it("scopes nutrition, progress, and weight operations to the authenticated user", async () => {
    const app = createApiServer({ logger: false });
    await app.inject({ method: "GET", url: "/api/v1/member/nutrition/substitutions?mealNumber=1&foodNumber=1" });
    expect(mocks.alternatives).toHaveBeenCalledWith("member-a", 1, 1, "gym-a");
    await app.inject({ method: "GET", url: "/api/v1/member/progress" });
    expect(mocks.progress).toHaveBeenCalledWith("member-a");
    const invalid = await app.inject({ method: "POST", url: "/api/v1/member/weight", payload: { weightKg: Number.NaN } });
    expect(invalid.statusCode).toBe(400);
    const valid = await app.inject({ method: "POST", url: "/api/v1/member/weight", payload: { weightKg: 82.5 } });
    expect(valid.statusCode).toBe(201);
    expect(mocks.weight).toHaveBeenCalledWith("member-a", 82.5, "gym-a");
    await app.close();
  });

  it("uses explicit CORS and production-style security headers", async () => {
    const app = createApiServer({ logger: false });
    const blocked = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(blocked.statusCode).toBe(403);
    const safe = await app.inject({ method: "GET", url: "/health" });
    expect(safe.headers["x-content-type-options"]).toBe("nosniff");
    expect(safe.headers["x-frame-options"]).toBe("DENY");
    expect(safe.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    await app.close();
  });
});
