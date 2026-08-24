import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMessageRole } from "../generated/prisma/client.js";

const mocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  prisma: {
    agentConversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    agentMessage: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../agent/orchestrator.js", () => ({ runAgent: mocks.runAgent }));
vi.mock("../lib/prisma.js", () => ({ prisma: mocks.prisma }));

import { AGENT_MODEL_CONTEXT_MESSAGES, runMemberAgentMessage } from "./agent-conversations.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback: (database: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  mocks.prisma.agentConversation.findFirst.mockResolvedValue({ id: "conversation-a", userId: "member-a", gymId: "gym-a" });
  mocks.prisma.agentConversation.update.mockResolvedValue({});
  mocks.prisma.agentMessage.create
    .mockResolvedValueOnce({ id: "user-message", role: AgentMessageRole.USER, content: "شلون تقدمي؟", createdAt: new Date() })
    .mockResolvedValueOnce({ id: "assistant-message", role: AgentMessageRole.ASSISTANT, content: "اتجاهك نازل", createdAt: new Date() });
  mocks.prisma.agentMessage.findMany.mockResolvedValue([]);
  mocks.prisma.agentMessage.deleteMany.mockResolvedValue({ count: 0 });
  mocks.runAgent.mockResolvedValue({ answer: "اتجاهك نازل", aiEventId: "event-a", toolCalls: 2, model: "fake" });
});

describe("member Agent conversation continuity", () => {
  it("uses bounded visible messages, forces member mode, and stores no tool reasoning", async () => {
    const history = Array.from({ length: AGENT_MODEL_CONTEXT_MESSAGES + 8 }, (_, index) => ({
      role: index % 2 ? AgentMessageRole.ASSISTANT : AgentMessageRole.USER,
      content: `message-${index}`,
    }));
    mocks.prisma.agentMessage.findMany.mockResolvedValueOnce(history).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await runMemberAgentMessage({ userId: "member-a", gymId: "gym-a", message: "شلون تقدمي؟" });
    expect(mocks.prisma.agentMessage.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: AGENT_MODEL_CONTEXT_MESSAGES }));
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-a", requestedGymId: "gym-a", memberMode: true, recentMessages: history.reverse() }));
    const createPayloads = mocks.prisma.agentMessage.create.mock.calls.map((call) => call[0].data);
    expect(createPayloads).toEqual([
      { conversationId: "conversation-a", role: AgentMessageRole.USER, content: "شلون تقدمي؟" },
      { conversationId: "conversation-a", role: AgentMessageRole.ASSISTANT, content: "اتجاهك نازل" },
    ]);
    expect(JSON.stringify(createPayloads)).not.toMatch(/tool|reasoning|api[_-]?key/i);
  });
});
