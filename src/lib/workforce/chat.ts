import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai/provider";
import { emitActivity } from "@/lib/harmony/os/events";
import { juliusRecall } from "@/lib/julius/wiring";
import { getAiosAgent } from "@/lib/workforce/registry";
import { buildAgentSystemPrompt } from "@/lib/workforce/agent-personas";
import { LIMITS } from "@/lib/limits";

/**
 * Per-agent chat (founder ↔ AIOS workforce member). Persists transcripts,
 * retrieves Julius context before replying, applies the agent's specialization
 * system prompt, and logs the turn to the activity feed. Advisory only — the
 * agent never executes risky/write actions here; those route through approvals.
 * Owner-scoped + company-scoped (RLS). Degrades gracefully until the migration
 * is applied.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  user_id: string;
  company_id: string | null;
  agent: string;
  role: ChatRole;
  content: string;
  refs: Record<string, unknown>;
  created_at: string;
}

export async function listChatMessages(
  userId: string,
  agent: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_chat_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("agent", agent)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[workforce/chat] listChatMessages", error.message);
    return [];
  }
  return (data as ChatMessage[] | null) ?? [];
}

export async function countChatMessages(
  userId: string,
  agent: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("agent_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("agent", agent);
  if (error) return 0;
  return count ?? 0;
}

export async function recordAgentChatExchange(params: {
  userId: string;
  companyId: string | null;
  agent: string;
  userMessage: string;
  assistantMessage: string;
  refs?: Record<string, unknown>;
}): Promise<boolean> {
  const userMessage = params.userMessage.trim();
  const assistantMessage = params.assistantMessage.trim();
  if (!userMessage || !assistantMessage) return false;
  const agentDef = getAiosAgent(params.agent);
  if (!agentDef) return false;

  const supabase = await createClient();
  const { error: userError } = await supabase.from("agent_chat_messages").insert({
    user_id: params.userId,
    company_id: params.companyId,
    agent: params.agent,
    role: "user",
    content: userMessage.slice(0, LIMITS.noteContent),
  });
  if (userError) {
    console.error("[workforce/chat] persist runtime user msg", userError.message);
    return false;
  }

  const { error: assistantError } = await supabase.from("agent_chat_messages").insert({
    user_id: params.userId,
    company_id: params.companyId,
    agent: params.agent,
    role: "assistant",
    content: assistantMessage.slice(0, LIMITS.noteContent),
    refs: params.refs ?? {},
  });
  if (assistantError) {
    console.error("[workforce/chat] persist runtime assistant msg", assistantError.message);
    return false;
  }

  await emitActivity({
    userId: params.userId,
    companyId: params.companyId,
    actorType: "founder",
    kind: "agent_action",
    summary: `Chatted with ${agentDef.name}`,
    refType: "agent_chat",
    refId: params.agent,
  });

  return true;
}

/**
 * Send a founder message to an agent and get its reply. Persists both turns,
 * grounds the reply in Julius context, and logs activity. Returns false on a
 * validation/persistence failure.
 */
export async function sendAgentChat(params: {
  userId: string;
  companyId: string | null;
  agent: string;
  message: string;
}): Promise<boolean> {
  const message = params.message.trim();
  if (!message) return false;
  const agentDef = getAiosAgent(params.agent);
  const system = buildAgentSystemPrompt(params.agent);
  if (!agentDef || !system) {
    console.error("[workforce/chat] unknown agent", params.agent);
    return false;
  }

  const supabase = await createClient();

  // Persist the founder's message.
  const { error: insErr } = await supabase.from("agent_chat_messages").insert({
    user_id: params.userId,
    company_id: params.companyId,
    agent: params.agent,
    role: "user",
    content: message.slice(0, LIMITS.noteContent),
  });
  if (insErr) {
    console.error("[workforce/chat] persist user msg", insErr.message);
    return false;
  }

  // Ground the reply: shared Julius context + recent conversation history.
  const julius = params.companyId
    ? await juliusRecall(params.userId, params.companyId, message, 6)
    : [];
  const history = (await listChatMessages(params.userId, params.agent, 12))
    .map((m) => `${m.role === "user" ? "Founder" : agentDef.name}: ${m.content}`)
    .join("\n");
  const contextBlock = julius.length
    ? "Relevant company memory (Julius):\n" +
      julius.map((e) => `- ${e.title}: ${e.content.slice(0, 280)}`).join("\n")
    : "";
  const prompt = [contextBlock, history, `Founder: ${message}`]
    .filter(Boolean)
    .join("\n\n");

  let reply: string;
  try {
    reply = await getProvider().generate(prompt, system);
  } catch (err) {
    console.error("[workforce/chat] provider.generate failed", err);
    reply = `I couldn't generate a response just now. Please try again.`;
  }

  await supabase.from("agent_chat_messages").insert({
    user_id: params.userId,
    company_id: params.companyId,
    agent: params.agent,
    role: "assistant",
    content: reply.slice(0, LIMITS.noteContent),
    refs: { julius: julius.map((e) => ({ id: e.id, title: e.title })) },
  });

  await emitActivity({
    userId: params.userId,
    companyId: params.companyId,
    actorType: "founder",
    kind: "agent_action",
    summary: `Chatted with ${agentDef.name}`,
    refType: "agent_chat",
    refId: params.agent,
  });

  return true;
}
