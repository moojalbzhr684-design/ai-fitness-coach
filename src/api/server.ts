import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";

export function createApiServer() {
  const app = Fastify({ logger: true });
  app.register(healthRoutes);
  return app;
}
