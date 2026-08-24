import Fastify from "fastify";
import type { AgentProvider } from "../agent/types.js";
import type { EmailProvider } from "../auth/email-provider.js";
import { toApiError } from "./errors.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { memberRoutes } from "./routes/member.js";
import { registerApiSecurity } from "./security.js";

export function createApiServer(options: {
  emailProvider?: EmailProvider;
  agentProvider?: AgentProvider;
  logger?: boolean;
} = {}) {
  const app = Fastify({ logger: options.logger ?? true });
  registerApiSecurity(app);
  app.register(healthRoutes);
  app.register(authRoutes, { emailProvider: options.emailProvider });
  app.register(memberRoutes, { agentProvider: options.agentProvider });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({
    error: { code: "NOT_FOUND", message: "Endpoint not found" },
  }));
  app.setErrorHandler((error, _request, reply) => {
    const apiError = toApiError(error);
    if (apiError.retryAfterSeconds) reply.header("Retry-After", apiError.retryAfterSeconds.toString());
    return reply.status(apiError.statusCode).send({
      error: { code: apiError.code, message: apiError.message },
    });
  });
  return app;
}
