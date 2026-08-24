import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GymRole, SystemRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(),
  createEvent: vi.fn(),
  finishSuccess: vi.fn(),
  finishError: vi.fn(),
  logTool: vi.fn(),
}));
vi.mock("./context.js", () => ({ buildAgentContext: mocks.buildContext }));
vi.mock("./observability.js", () => ({
  createAgentEvent: mocks.createEvent,
  finishAgentEventSuccess: mocks.finishSuccess,
  finishAgentEventError: mocks.finishError,
  logToolExecution: mocks.logTool,
}));

import { AgentUnavailableError } from "./errors.js";
import { MAX_TOOL_ROUNDS, MAX_TOTAL_TOOL_CALLS, runAgent } from "./orchestrator.js";
import { FakeAgentProvider } from "./provider.js";
import { AgentToolRegistry } from "./registry.js";
import { ToolCategory, type AgentProviderResponse, type AgentToolDefinition } from "./types.js";

const context = {
  actor: { userId: "member-a", gymId: "gym-a", systemRole: SystemRole.USER, gymRole: GymRole.MEMBER, allowActions: true, gymSelectionRequired: false },
  user: { profile: { goal: "STRENGTH" } }, gym: null, trainer: null,
  workout: { program: null, currentSession: null, recentSessions: [] },
  nutrition: { targets: null, planSummary: null }, progress: { summary: null, latestDecision: null },
  photos: null, memory: { foodPreferences: [], dislikedFoods: [], memories: [] }, gymOptions: [],
};
const response = (id: string, toolCalls: AgentProviderResponse["toolCalls"], outputText = ""): AgentProviderResponse => ({ id, model: "fake-model", outputText, toolCalls });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buildContext.mockResolvedValue(context);
  mocks.createEvent.mockResolvedValue({ id: "event-a" });
});

function testRegistry(handler: AgentToolDefinition["handler"] = async () => ({ value: 1 }), category: ToolCategory = ToolCategory.READ) {
  return new AgentToolRegistry([{ name: "test_tool", description: "test", category, schema: z.object({ value: z.number().int() }).strict(), handler }]);
}

describe("Agent orchestrator loop", () => {
  it("supports a scripted multi-tool sequence and final answer", async () => {
    const provider = new FakeAgentProvider([
      response("r1", [{ callId: "c1", name: "test_tool", arguments: { value: 1 } }]),
      response("r2", [{ callId: "c2", name: "test_tool", arguments: { value: 2 } }]),
      response("r3", [], "هذا جواب من البيانات الحقيقية"),
    ]);
    const result = await runAgent({ userId: "member-a", message: "شلون تقدمي؟", provider, registry: testRegistry() });
    expect(result.answer).toBe("هذا جواب من البيانات الحقيقية");
    expect(result.toolCalls).toBe(2);
    expect(provider.requests[1]?.toolOutputs?.[0]?.output).toContain('"ok":true');
    expect(mocks.logTool).toHaveBeenCalledTimes(2);
    expect(mocks.finishSuccess).toHaveBeenCalledWith(expect.objectContaining({ aiEventId: "event-a", model: "fake-model" }));
  });

  it("forces member-only context and sends only bounded visible conversation history", async () => {
    const provider = new FakeAgentProvider([response("r1", [], "تمام")]);
    const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "ASSISTANT" as const : "USER" as const, content: `message-${index}` }));
    await runAgent({ userId: "member-a", message: "هسه شسوي؟", memberMode: true, recentMessages: history, provider, registry: testRegistry() });
    expect(mocks.buildContext).toHaveBeenCalledWith("member-a", undefined, { memberOnly: true });
    expect(provider.requests[0]?.input).toContain("message-8");
    expect(provider.requests[0]?.input).not.toContain("message-7\n");
    expect(provider.requests[0]?.input).toContain("Current user message: هسه شسوي؟");
  });

  it("enforces the total tool call limit without executing overflow", async () => {
    const calls = Array.from({ length: MAX_TOTAL_TOOL_CALLS + 1 }, (_, index) => ({ callId: `c${index}`, name: "test_tool", arguments: { value: index } }));
    const handler = vi.fn(async () => ({}));
    const result = await runAgent({ userId: "member-a", message: "طلب", provider: new FakeAgentProvider([response("r1", calls)]), registry: testRegistry(handler) });
    expect(result.answer).toContain("ما گدرت أكمل");
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.finishError).toHaveBeenCalledOnce();
  });

  it("enforces the tool round limit", async () => {
    const scripted = Array.from({ length: MAX_TOOL_ROUNDS + 1 }, (_, index) => response(`r${index}`, [{ callId: `c${index}`, name: "test_tool", arguments: { value: index } }]));
    const handler = vi.fn(async () => ({}));
    const result = await runAgent({ userId: "member-a", message: "طلب", provider: new FakeAgentProvider(scripted), registry: testRegistry(handler) });
    expect(result.answer).toContain("ما گدرت أكمل");
    expect(handler).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
  });

  it("never emits fake success after an action tool failure", async () => {
    const provider = new FakeAgentProvider([
      response("r1", [{ callId: "c1", name: "test_tool", arguments: { value: 1 } }]),
      response("r2", [], "✅ سجلت السيت بنجاح"),
    ]);
    const result = await runAgent({ userId: "member-a", message: "سجل السيت", provider, registry: testRegistry(async () => { throw new Error("database failed"); }, ToolCategory.ACTION) });
    expect(result.answer).not.toContain("سجلت");
    expect(result.answer).toContain("ما گدرت");
    expect(provider.requests[1]?.toolOutputs?.[0]?.output).toContain('"ok":false');
  });

  it("returns malformed model tool input as a structured rejection", async () => {
    const provider = new FakeAgentProvider([
      response("r1", [{ callId: "c1", name: "test_tool", arguments: null, parseError: "bad json" }]),
      response("r2", [], "حدد طلبك مرة ثانية"),
    ]);
    await expect(runAgent({ userId: "member-a", message: "طلب", provider, registry: testRegistry() })).resolves.toMatchObject({ answer: expect.stringContaining("ما گدرت") });
    expect(provider.requests[1]?.toolOutputs?.[0]?.output).toContain("INVALID_INPUT");
  });

  it("records provider failure and exposes only AgentUnavailableError", async () => {
    await expect(runAgent({ userId: "member-a", message: "طلب", provider: new FakeAgentProvider([new Error("API unavailable")]), registry: testRegistry() })).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(mocks.finishError).toHaveBeenCalledOnce();
  });

  it("stops for serious symptoms without calling the provider", async () => {
    const provider = new FakeAgentProvider([]);
    const result = await runAgent({ userId: "member-a", message: "عندي ألم بالصدر وضيق تنفس شديد", provider, registry: testRegistry() });
    expect(result.model).toBe("DETERMINISTIC_SAFETY");
    expect(result.answer).toContain("تقييم طبي");
    expect(provider.requests).toHaveLength(0);
  });
});
