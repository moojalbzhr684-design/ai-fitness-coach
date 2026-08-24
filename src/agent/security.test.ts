import { describe, expect, it } from "vitest";
import { GymRole, SystemRole } from "../generated/prisma/client.js";
import { zodResponsesFunction } from "openai/helpers/zod";
import { agentToolRegistry } from "./registry.js";
import { foodMacroInputSchema, logWorkoutSetInputSchema, reviewRequestInputSchema } from "./schemas.js";

const member = {
  userId: "member-a",
  gymId: "gym-a",
  systemRole: SystemRole.USER,
  gymRole: GymRole.MEMBER,
  allowActions: true,
  gymSelectionRequired: false,
};

describe("Agent security surface", () => {
  it("contains no SQL, shell, browsing, direct calorie mutation, plan edit, or exact body-fat tool", () => {
    const names = agentToolRegistry.providerTools(member).map((tool) => tool.name);
    expect(names).not.toEqual(expect.arrayContaining([
      "sql", "shell", "browse", "change_calories", "edit_workout", "update_plan", "estimate_body_fat",
    ]));
  });

  it("does not expose trainer approvals to a member Agent context", () => {
    expect(agentToolRegistry.providerTools(member).map((tool) => tool.name)).not.toContain("get_pending_trainer_approvals");
  });

  it("does not expose member plan-review actions in a trainer Agent context", () => {
    const trainer = { ...member, gymRole: GymRole.TRAINER };
    expect(agentToolRegistry.providerTools(trainer).map((tool) => tool.name)).not.toContain("request_structured_plan_review");
  });

  it("rejects model-controlled actor and role claims in an action schema", () => {
    expect(logWorkoutSetInputSchema.safeParse({ exerciseReference: "1", setNumber: 1, weightKg: 60, reps: 10, actorUserId: "other" }).success).toBe(false);
    expect(reviewRequestInputSchema.safeParse({ scope: "NUTRITION", systemRole: "SUPER_ADMIN", gymRole: "TRAINER" }).success).toBe(false);
  });

  it("rejects invalid set ranges, NaN, Infinity, and unexpected properties", () => {
    expect(logWorkoutSetInputSchema.safeParse({ exerciseReference: "1", setNumber: 0, weightKg: 60, reps: 10 }).success).toBe(false);
    expect(logWorkoutSetInputSchema.safeParse({ exerciseReference: "1", setNumber: 1, weightKg: Number.NaN, reps: 10 }).success).toBe(false);
    expect(logWorkoutSetInputSchema.safeParse({ exerciseReference: "1", setNumber: 1, weightKg: 60, reps: 101 }).success).toBe(false);
    expect(foodMacroInputSchema.safeParse({ foodReference: "دجاج", quantityGrams: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("exposes photo tools that are text-summary only", () => {
    const photos = ["get_latest_photo_analysis", "get_photo_progress_summary"].map((name) => agentToolRegistry.get(name));
    expect(photos.every(Boolean)).toBe(true);
    expect(agentToolRegistry.has("get_photo_bytes")).toBe(false);
    expect(agentToolRegistry.has("get_photo_url")).toBe(false);
  });

  it("compiles every member tool to an official OpenAI strict Responses schema", () => {
    for (const tool of agentToolRegistry.providerTools(member)) {
      expect(() => zodResponsesFunction({ name: tool.name, description: tool.description, parameters: tool.schema })).not.toThrow();
    }
  });
});
