import { ZodError } from "zod";
import { AgentUnavailableError, AgentToolError } from "../agent/errors.js";
import { MemberAuthError } from "../auth/member-auth.js";
import { MemberAuthenticationError } from "../auth/member-session.js";
import { RateLimitError } from "../auth/rate-limit.js";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) return new ApiError(400, "VALIDATION_ERROR", "The request contains invalid fields");
  if (error instanceof RateLimitError) return new ApiError(429, "RATE_LIMITED", "Too many requests. Try again later.", error.retryAfterSeconds);
  if (error instanceof MemberAuthenticationError) {
    if (error.code === "UNAUTHENTICATED") return new ApiError(401, "UNAUTHENTICATED", "Authentication required");
    if (error.code === "GYM_SELECTION_REQUIRED") return new ApiError(409, error.code, error.message);
    return new ApiError(403, error.code, error.message);
  }
  if (error instanceof MemberAuthError) {
    const conflict = error.code === "IDENTITY_CONFLICT";
    const delivery = error.code === "EMAIL_DELIVERY_UNAVAILABLE";
    return new ApiError(conflict ? 409 : delivery ? 503 : 400, error.code, error.message);
  }
  if (error instanceof AgentToolError) {
    if (error.code === "INVALID_INPUT" || error.code === "UNKNOWN_TOOL") return new ApiError(400, "VALIDATION_ERROR", "The request contains invalid fields");
    if (error.code === "FORBIDDEN") return new ApiError(403, "FORBIDDEN", "This action is not available");
    if (error.code === "TIMEOUT") return new ApiError(504, "TOOL_TIMEOUT", "The operation timed out");
    return new ApiError(409, "ACTION_FAILED", "The operation could not be completed");
  }
  if (error instanceof AgentUnavailableError) {
    return new ApiError(503, "AGENT_UNAVAILABLE", "ما گدرت أكمل طلبك هسه. حاول مرة ثانية.");
  }
  if (error instanceof Error && [
    "WorkoutSessionError",
    "WorkoutProgramError",
    "NutritionPlanError",
    "CheckInError",
    "ProgressPhotoError",
    "ApprovalServiceError",
    "AgentConversationError",
  ].includes(error.name)) {
    return new ApiError(400, "ACTION_REJECTED", error.message);
  }
  return new ApiError(500, "INTERNAL_ERROR", "The request could not be completed");
}
