import { GymRole, SystemRole } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentProvider } from "../../agent/types.js";
import { agentToolRegistry } from "../../agent/registry.js";
import { finishWorkoutInputSchema, logWorkoutSetInputSchema, startWorkoutInputSchema } from "../../agent/schemas.js";
import { resolveMemberGymScope } from "../../auth/member-scope.js";
import { authenticateMemberRequest, requireMutationCsrf } from "../../auth/member-session.js";
import { agentRateLimiter } from "../../auth/rate-limit.js";
import { env } from "../../config/env.js";
import { getFoodMacrosByReference, getMealItemAlternatives } from "../../services/foods.js";
import { getNutritionTargets } from "../../services/nutrition-plans.js";
import { getCheckInStatus } from "../../services/progress.js";
import { deleteMemberProgressPhotoSet } from "../../services/progress-photos.js";
import { logManualWeight, submitStructuredCheckIn } from "../../services/checkins.js";
import { listAgentConversationMessages, runMemberAgentMessage } from "../../services/agent-conversations.js";
import {
  currentWorkoutPayload,
  getMemberHomePayload,
  getMemberIdentityPayload,
  getMemberNutritionPayload,
  getMemberPhotoMetadata,
  getMemberProgressPayload,
  getMemberWorkoutPayload,
} from "../../services/member-api.js";
import { getCurrentWorkoutSession } from "../../services/workout-sessions.js";
import { updateMemberProfile } from "../../services/users.js";

const messageSchema = z.object({ message: z.string().trim().min(1).max(4_000) }).strict();
const weightSchema = z.object({ weightKg: z.number().finite().min(30).max(300) }).strict();
const macroQuerySchema = z.object({
  food: z.string().trim().min(1).max(100).optional(),
  quantityGrams: z.coerce.number().finite().min(1).max(2_000).optional(),
}).strict().refine((value) => Boolean(value.food) === (value.quantityGrams !== undefined), "food and quantityGrams must be provided together");
const alternativesQuerySchema = z.object({
  mealNumber: z.coerce.number().int().min(1).max(12),
  foodNumber: z.coerce.number().int().min(1).max(30),
}).strict();
const photoRefSchema = z.object({ photoSetRef: z.string().trim().min(1).max(100) }).strict();

function gymHeader(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return undefined;
  return z.string().trim().min(1).max(100).parse(raw);
}

async function memberContext(request: Parameters<typeof authenticateMemberRequest>[0]) {
  const auth = await authenticateMemberRequest(request);
  const scope = resolveMemberGymScope(auth, gymHeader(request.headers["x-gym-id"]));
  return { auth, scope };
}

function toolActor(userId: string, gymId: string | null) {
  return {
    userId,
    gymId,
    systemRole: SystemRole.USER,
    gymRole: gymId ? GymRole.MEMBER : null,
    allowActions: true,
    gymSelectionRequired: false,
  };
}

export async function memberRoutes(app: FastifyInstance, options: { agentProvider?: AgentProvider } = {}) {
  app.get("/api/v1/member/me", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    const requestedGymId = gymHeader(request.headers["x-gym-id"]);
    const memberMemberships = auth.session.user.gymMemberships.filter((item) => item.role === GymRole.MEMBER);
    const gymId = requestedGymId
      ? resolveMemberGymScope(auth, requestedGymId).gymId
      : memberMemberships.length === 1 ? memberMemberships[0]!.gymId : null;
    return reply.send({ data: await getMemberIdentityPayload(auth.session.userId, gymId) });
  });

  app.patch("/api/v1/member/profile", async (request, reply) => {
    const { auth } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const profile = await updateMemberProfile(auth.session.userId, request.body);
    return reply.send({ data: profile });
  });

  app.get("/api/v1/member/home", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    return reply.send({ data: await getMemberHomePayload(auth.session.userId, scope.gymId) });
  });

  app.get("/api/v1/member/workout", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    return reply.send({ data: await getMemberWorkoutPayload(auth.session.userId, scope.gymId) });
  });

  app.get("/api/v1/member/workout/current", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    const current = await getCurrentWorkoutSession(auth.session.userId, scope.gymId);
    return reply.send({ data: current ? currentWorkoutPayload(current) : null });
  });

  app.post("/api/v1/member/workout/start", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const input = startWorkoutInputSchema.parse(request.body ?? {});
    const data = await agentToolRegistry.execute("start_workout", input, {
      actor: toolActor(auth.session.userId, scope.gymId),
      aiEventId: "member-api",
    });
    return reply.send({ data });
  });

  app.post("/api/v1/member/workout/set", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const input = logWorkoutSetInputSchema.parse(request.body);
    const data = await agentToolRegistry.execute("log_workout_set", input, {
      actor: toolActor(auth.session.userId, scope.gymId),
      aiEventId: "member-api",
    });
    return reply.send({ data });
  });

  app.post("/api/v1/member/workout/finish", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const input = finishWorkoutInputSchema.parse(request.body ?? {});
    const data = await agentToolRegistry.execute("finish_workout", input, {
      actor: toolActor(auth.session.userId, scope.gymId),
      aiEventId: "member-api",
    });
    return reply.send({ data });
  });

  app.get("/api/v1/member/nutrition", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    return reply.send({ data: await getMemberNutritionPayload(auth.session.userId, scope.gymId) });
  });

  app.get("/api/v1/member/nutrition/macros", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    const query = macroQuerySchema.parse(request.query);
    return reply.send({ data: query.food && query.quantityGrams !== undefined
      ? await getFoodMacrosByReference(query.food, query.quantityGrams)
      : await getNutritionTargets(auth.session.userId, scope.gymId) });
  });

  app.get("/api/v1/member/nutrition/targets", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    return reply.send({ data: await getNutritionTargets(auth.session.userId, scope.gymId) });
  });

  app.get("/api/v1/member/nutrition/substitutions", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    const query = alternativesQuerySchema.parse(request.query);
    const result = await getMealItemAlternatives(auth.session.userId, query.mealNumber, query.foodNumber, scope.gymId);
    return reply.send({ data: result ? {
      original: { name: result.item.food.name, nameAr: result.item.food.nameAr, quantityGrams: result.item.quantityGrams },
      alternatives: result.alternatives,
    } : null });
  });

  app.get("/api/v1/member/progress", async (request, reply) => {
    const { auth } = await memberContext(request);
    return reply.send({ data: await getMemberProgressPayload(auth.session.userId) });
  });

  app.post("/api/v1/member/weight", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const { weightKg } = weightSchema.parse(request.body);
    const measurement = await logManualWeight(auth.session.userId, weightKg, scope.gymId ?? undefined);
    return reply.status(201).send({ data: { weightKg: measurement.weightKg, measuredAt: measurement.measuredAt } });
  });

  app.get("/api/v1/member/checkin", async (request, reply) => {
    const { auth } = await memberContext(request);
    return reply.send({ data: await getCheckInStatus(auth.session.userId) });
  });

  app.post("/api/v1/member/checkin", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const result = await submitStructuredCheckIn(auth.session.userId, request.body, scope.gymId ?? undefined);
    return reply.status(201).send({ data: result });
  });

  app.get("/api/v1/member/photos", async (request, reply) => {
    const { auth } = await memberContext(request);
    return reply.send({ data: await getMemberPhotoMetadata(auth.session.userId) });
  });

  app.get("/api/v1/member/photos/latest", async (request, reply) => {
    const { auth } = await memberContext(request);
    const sets = await getMemberPhotoMetadata(auth.session.userId);
    return reply.send({ data: sets[0] ?? null });
  });

  app.delete("/api/v1/member/photos/:photoSetRef", async (request, reply) => {
    const { auth } = await memberContext(request);
    requireMutationCsrf(request, auth);
    const { photoSetRef } = photoRefSchema.parse(request.params);
    return reply.send({ data: await deleteMemberProgressPhotoSet(auth.session.userId, photoSetRef) });
  });

  app.get("/api/v1/member/agent/conversation", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    return reply.send({ data: await listAgentConversationMessages(auth.session.userId, scope.gymId) });
  });

  app.post("/api/v1/member/agent/message", async (request, reply) => {
    const { auth, scope } = await memberContext(request);
    requireMutationCsrf(request, auth);
    agentRateLimiter.consume(
      `agent:${auth.session.userId}:${request.ip}`,
      env.AGENT_MESSAGES_PER_MINUTE,
      60_000,
    );
    const body = messageSchema.parse(request.body);
    const result = await runMemberAgentMessage({
      userId: auth.session.userId,
      gymId: scope.gymId,
      message: body.message,
      ...(options.agentProvider ? { provider: options.agentProvider } : {}),
    });
    return reply.send({ data: { message: result.message, createdAt: result.assistantMessage.createdAt } });
  });
}
