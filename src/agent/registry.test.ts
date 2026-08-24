import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GymRole, SystemRole } from "../generated/prisma/client.js";
import { AgentToolError } from "./errors.js";
import { AgentToolRegistry } from "./registry.js";
import { ToolCategory, type AgentActor, type AgentToolDefinition } from "./types.js";

const member: AgentActor = {
  userId: "member-a",
  gymId: "gym-a",
  systemRole: SystemRole.USER,
  gymRole: GymRole.MEMBER,
  allowActions: true,
  gymSelectionRequired: false,
};
const empty = z.object({}).strict();

function registry(handler: AgentToolDefinition["handler"] = vi.fn(async () => ({ ok: true }))) {
  const definitions: AgentToolDefinition[] = [
    { name: "read_profile", description: "read", category: ToolCategory.READ, schema: empty, handler },
    { name: "perform_action", description: "act", category: ToolCategory.ACTION, schema: z.object({ value: z.number().finite().min(1).max(10) }).strict(), handler },
    { name: "trainer_only", description: "privileged", category: ToolCategory.PRIVILEGED, schema: empty, requiresGym: true, handler },
  ];
  return new AgentToolRegistry(definitions);
}

describe("Agent tool registry", () => {
  it("registers only known explicit tools and rejects unknown names", async () => {
    const tools = registry();
    expect(tools.has("read_profile")).toBe(true);
    expect(tools.has("shell")).toBe(false);
    await expect(tools.execute("shell", {}, { actor: member, aiEventId: "event-a" })).rejects.toMatchObject({ code: "UNKNOWN_TOOL" } satisfies Partial<AgentToolError>);
  });

  it("strictly rejects malformed and identity-injection inputs", async () => {
    const tools = registry();
    await expect(tools.execute("perform_action", { value: Number.NaN }, { actor: member, aiEventId: "event-a" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(tools.execute("read_profile", { actorUserId: "victim", systemRole: "SUPER_ADMIN", gymRole: "TRAINER" }, { actor: member, aiEventId: "event-a" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("enforces read/action/privileged classification from server actor context", async () => {
    const tools = registry();
    expect(tools.providerTools(member).map((tool) => tool.name)).toEqual(["read_profile", "perform_action"]);
    await expect(tools.execute("trainer_only", {}, { actor: member, aiEventId: "event-a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const trainer = { ...member, gymRole: GymRole.TRAINER };
    expect(tools.providerTools(trainer).map((tool) => tool.name)).toContain("trainer_only");
    const readOnly = { ...member, allowActions: false };
    expect(tools.providerTools(readOnly).map((tool) => tool.name)).toEqual(["read_profile"]);
  });

  it("injects authenticated identity into the handler instead of model input", async () => {
    const handler = vi.fn(async (_input: unknown, context: { actor: AgentActor }) => context.actor.userId);
    const tools = registry(handler);
    await expect(tools.execute("read_profile", {}, { actor: member, aiEventId: "event-a" })).resolves.toBe("member-a");
    expect(handler).toHaveBeenCalledWith({}, expect.objectContaining({ actor: expect.objectContaining({ userId: "member-a", gymId: "gym-a" }) }));
  });

  it("times out a blocking tool", async () => {
    const handler = vi.fn(() => new Promise(() => undefined));
    const tools = registry(handler);
    await expect(tools.execute("read_profile", {}, { actor: member, aiEventId: "event-a" }, 5)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
