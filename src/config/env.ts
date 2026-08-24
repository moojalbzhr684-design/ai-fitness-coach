import "dotenv/config";
import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  // Kept as a string so server-only Web builds do not need a bot secret. The backend bot
  // boundary calls requireTelegramBotToken and fails closed before polling starts.
  TELEGRAM_BOT_TOKEN: z.string().trim().default(""),
  TELEGRAM_BOT_USERNAME: optionalTrimmedString,
  MEMBER_WEB_URL: optionalTrimmedString,
  MEMBER_PROXY_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  OPENAI_API_KEY: optionalTrimmedString,
  OPENAI_MODEL: z.string().trim().min(1).default("gpt-5"),
  SUPER_ADMIN_TELEGRAM_ID: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().regex(/^\d+$/, "SUPER_ADMIN_TELEGRAM_ID must contain digits only").optional(),
  ),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MEMBER_ALLOWED_ORIGINS: z.string().trim().default("http://localhost:3001"),
  MEMBER_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_OTP_EXPIRY_MINUTES: z.coerce.number().int().min(3).max(30).default(10),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  AUTH_OTP_REQUESTS_PER_WINDOW: z.coerce.number().int().min(1).max(20).default(5),
  AUTH_OTP_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  AUTH_TELEGRAM_EXPIRY_MINUTES: z.coerce.number().int().min(5).max(10).default(8),
  AUTH_TELEGRAM_REQUESTS_PER_WINDOW: z.coerce.number().int().min(1).max(30).default(8),
  AUTH_TELEGRAM_POLLS_PER_WINDOW: z.coerce.number().int().min(10).max(120).default(60),
  AGENT_MESSAGES_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(12),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const messages = result.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${messages}`);
}

export const env = result.data;

export function requireTelegramBotToken(): string {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is required");
  return env.TELEGRAM_BOT_TOKEN;
}
