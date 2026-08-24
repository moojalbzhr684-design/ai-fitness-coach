import { AgentMessageRole } from "../generated/prisma/client.js";
import type { AgentProvider } from "../agent/types.js";
import { runAgent } from "../agent/orchestrator.js";
import { prisma } from "../lib/prisma.js";

export const AGENT_HISTORY_STORAGE_LIMIT = 100;
export const AGENT_MODEL_CONTEXT_MESSAGES = 12;

export class AgentConversationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConversationError";
  }
}

export async function getOrCreateAgentConversation(userId: string, gymId: string | null) {
  const existing = await prisma.agentConversation.findFirst({
    where: { userId, gymId },
    orderBy: { lastMessageAt: "desc" },
  });
  return existing ?? prisma.agentConversation.create({ data: { userId, gymId } });
}

export async function listAgentConversationMessages(userId: string, gymId: string | null, limit = 40) {
  const conversation = await prisma.agentConversation.findFirst({
    where: { userId, gymId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, lastMessageAt: true },
  });
  if (!conversation) return { conversation: null, messages: [] };
  const messages = await prisma.agentMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return { conversation, messages: messages.reverse() };
}

async function appendMessage(conversationId: string, role: AgentMessageRole, content: string) {
  const value = content.trim();
  if (!value || value.length > 4_000) throw new AgentConversationError("Invalid conversation message");
  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const database = tx as unknown as typeof prisma;
    const message = await database.agentMessage.create({
      data: { conversationId, role, content: value },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    await database.agentConversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
    return message;
  });
  const overflow = await prisma.agentMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    skip: AGENT_HISTORY_STORAGE_LIMIT,
    select: { id: true },
  });
  if (overflow.length) await prisma.agentMessage.deleteMany({ where: { id: { in: overflow.map((item) => item.id) } } });
  return created;
}

export async function runMemberAgentMessage(input: {
  userId: string;
  gymId: string | null;
  message: string;
  provider?: AgentProvider;
}) {
  const conversation = await getOrCreateAgentConversation(input.userId, input.gymId);
  const history = await prisma.agentMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: AGENT_MODEL_CONTEXT_MESSAGES,
    select: { role: true, content: true },
  });
  const userMessage = await appendMessage(conversation.id, AgentMessageRole.USER, input.message);
  const result = await runAgent({
    userId: input.userId,
    message: input.message,
    ...(input.gymId ? { requestedGymId: input.gymId } : {}),
    memberMode: true,
    recentMessages: history.reverse(),
    ...(input.provider ? { provider: input.provider } : {}),
  });
  const assistantMessage = await appendMessage(conversation.id, AgentMessageRole.ASSISTANT, result.answer);
  return {
    conversationId: conversation.id,
    message: result.answer,
    userMessage,
    assistantMessage,
    aiEventId: result.aiEventId,
  };
}
