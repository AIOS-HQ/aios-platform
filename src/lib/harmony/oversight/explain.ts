import "server-only";

import { juliusRecall } from "@/lib/julius/wiring";
import type { Agent, Conversation, Message } from "@/types/database";

/**
 * "Explain Why" — grounded reasoning for a conversation.
 *
 * Assembles ONLY real facts: whether the latest Harmony response is held for
 * approval (and therefore why it hasn't sent), who the assigned specialist is,
 * and the company knowledge most relevant to this contact (recalled from
 * Julius). Nothing is inferred or generated — the page renders these facts as
 * the explanation, so it can never fabricate a rationale.
 */
export interface ConversationExplanation {
  held: boolean;
  assignedAgent: string | null;
  knowledge: { id: string; title: string; content: string }[];
}

export async function explainConversation(params: {
  userId: string;
  companyId: string | null;
  conversation: Conversation;
  messages: Message[];
  agents: Agent[];
}): Promise<ConversationExplanation> {
  const { userId, companyId, conversation, messages, agents } = params;

  const lastOutbound = [...messages].reverse().find((m) => m.direction === "outbound");
  const held = lastOutbound?.status === "awaiting_approval";

  const assignedAgent = conversation.assigned_agent_id
    ? agents.find((a) => a.id === conversation.assigned_agent_id)?.name ?? null
    : null;

  let knowledge: { id: string; title: string; content: string }[] = [];
  if (companyId) {
    const query = [conversation.contact, conversation.subject ?? ""].join(" ").trim();
    try {
      const entries = await juliusRecall(userId, companyId, query || undefined, 5);
      knowledge = entries.map((e) => ({
        id: e.id,
        title: e.title,
        content: e.content.length > 240 ? `${e.content.slice(0, 240)}…` : e.content,
      }));
    } catch {
      knowledge = [];
    }
  }

  return { held, assignedAgent, knowledge };
}
