import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { ApiError } from "./errors.js";

const PROXY_IP_HEADER = "x-afc-proxy-ip";
const PROXY_SIGNATURE_HEADER = "x-afc-proxy-signature";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function trustedClientIp(request: FastifyRequest): string {
  const ip = headerValue(request.headers[PROXY_IP_HEADER]);
  const signature = headerValue(request.headers[PROXY_SIGNATURE_HEADER]);
  if (!env.MEMBER_PROXY_SECRET || !ip || !signature || ip.length > 128 || !/^[a-f0-9]{64}$/.test(signature)) {
    return request.ip;
  }
  const expected = createHmac("sha256", env.MEMBER_PROXY_SECRET).update(ip).digest("hex");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    ? ip
    : request.ip;
}

export function registerApiSecurity(app: FastifyInstance) {
  const allowedOrigins = new Set(env.MEMBER_ALLOWED_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean));
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const origin = request.headers.origin;
    if (origin) {
      if (!allowedOrigins.has(origin)) throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed");
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-CSRF-Token,X-Gym-Id");
      reply.header("Access-Control-Max-Age", "600");
      await reply.status(204).send();
    }
  });
}
