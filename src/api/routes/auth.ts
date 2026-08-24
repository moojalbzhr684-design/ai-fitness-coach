import { AuthChallengePurpose } from "../../generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { EmailProvider } from "../../auth/email-provider.js";
import { requestEmailLoginCode, verifyEmailLoginCode } from "../../auth/member-auth.js";
import {
  authenticateMemberRequest,
  clearMemberCsrfCookie,
  clearMemberSessionCookie,
  memberCsrfCookie,
  memberSessionCookie,
  rotateMemberCsrfToken,
  requireMutationCsrf,
  revokeMemberSession,
  revokeUserSession,
} from "../../auth/member-session.js";
import { prisma } from "../../lib/prisma.js";

const requestSchema = z.object({ email: z.string().trim().min(3).max(254) }).strict();
const verifySchema = z.object({
  email: z.string().trim().min(3).max(254),
  challengeId: z.string().trim().min(1).max(100),
  code: z.string().regex(/^\d{6}$/),
  client: z.enum(["WEB", "MOBILE"]).default("WEB"),
}).strict();
const revokeSchema = z.object({ sessionRef: z.string().trim().min(1).max(100) }).strict();

export async function authRoutes(app: FastifyInstance, options: { emailProvider?: EmailProvider } = {}) {
  app.post("/api/v1/auth/otp/request", async (request, reply) => {
    const body = requestSchema.parse(request.body);
    const result = await requestEmailLoginCode({
      email: body.email,
      ip: request.ip,
      ...(options.emailProvider ? { provider: options.emailProvider } : {}),
    });
    return reply.status(202).send({ data: result });
  });

  app.post("/api/v1/auth/otp/verify", async (request, reply) => {
    const body = verifySchema.parse(request.body);
    const result = await verifyEmailLoginCode({ email: body.email, challengeId: body.challengeId, code: body.code, expectedPurpose: AuthChallengePurpose.LOGIN });
    if (result.linked) throw new Error("Unexpected link result");
    reply.header("Set-Cookie", [
      memberSessionCookie(result.session.token, result.session.expiresAt),
      memberCsrfCookie(result.session.csrfToken, result.session.expiresAt),
    ]);
    return reply.send({
      data: {
        csrfToken: result.session.csrfToken,
        ...(body.client === "MOBILE" ? { bearerToken: result.session.token } : {}),
        expiresAt: result.session.expiresAt,
      },
    });
  });

  app.post("/api/v1/auth/link/email/request", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    requireMutationCsrf(request, auth);
    const body = requestSchema.parse(request.body);
    const result = await requestEmailLoginCode({
      email: body.email,
      ip: request.ip,
      purpose: AuthChallengePurpose.LINK_IDENTITY,
      linkUserId: auth.session.userId,
      ...(options.emailProvider ? { provider: options.emailProvider } : {}),
    });
    return reply.status(202).send({ data: result });
  });

  app.post("/api/v1/auth/link/email/verify", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    requireMutationCsrf(request, auth);
    const body = verifySchema.parse(request.body);
    await verifyEmailLoginCode({
      email: body.email,
      challengeId: body.challengeId,
      code: body.code,
      expectedPurpose: AuthChallengePurpose.LINK_IDENTITY,
      authenticatedUserId: auth.session.userId,
    });
    return reply.send({ data: { linked: true } });
  });

  app.get("/api/v1/auth/sessions", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    const sessions = await prisma.authSession.findMany({
      where: { userId: auth.session.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return reply.send({ data: sessions.map(({ id, ...item }) => ({ ...item, current: id === auth.session.id, sessionRef: id })) });
  });

  app.get("/api/v1/auth/csrf", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    const csrfToken = await rotateMemberCsrfToken(auth.session.id);
    reply.header("Set-Cookie", memberCsrfCookie(csrfToken, auth.session.expiresAt));
    return reply.send({ data: { csrfToken } });
  });

  app.post("/api/v1/auth/sessions/revoke", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    requireMutationCsrf(request, auth);
    const body = revokeSchema.parse(request.body);
    const revoked = await revokeUserSession(auth.session.userId, body.sessionRef);
    return reply.send({ data: { revoked } });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const auth = await authenticateMemberRequest(request);
    requireMutationCsrf(request, auth);
    await revokeMemberSession(auth.session.id);
    reply.header("Set-Cookie", [clearMemberSessionCookie(), clearMemberCsrfCookie()]);
    return reply.send({ data: { loggedOut: true } });
  });
}
