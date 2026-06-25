"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { detectIntent } from "@/lib/ai/intents";
import { getProvider, isRealProviderConfigured } from "@/lib/ai/provider";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { resolvePrimaryCompanyId, getJuliusAwareness } from "@/lib/julius/wiring";
import { LIMITS } from "@/lib/limits";
import { requiresApproval, type AutonomyLevel } from "@/lib/harmony/os/autonomy";
import { delegateToHarmony } from "@/lib/harmony/os/delegate-actions";
import type { OperatorResult } from "@/lib/ai/types";
import type { PersonalGoal, PersonalNote, PersonalTask } from "@/types/database";

/**
 * Harmony reads the shared Julius brain before composing a free-form reply, so
 * she always responds with the latest cross-workforce context (objectives,
 * decisions, recent activity, knowledge). Company-scoped and fail-open: any
 * issue resolving context simply falls back to the base system prompt.
 */
async function harmonySystemPrompt(base: string, userId: string): Promise<string> {
  try {
    const companyId = await resolvePrimaryCompanyId();
    if (!companyId) return base;
    const a = await getJuliusAwareness(userId, companyId);
    if (a.total === 0) return base;
    const fmt = (items: { title: string }[]) =>
      items.slice(0, 5).map((i) => `- ${i.title}`).join("\n");
    const blocks: string[] = [];
    if (a.objectives.length) blocks.push(`Objectives:\n${fmt(a.objectives)}`);
    if (a.decisions.length) blocks.push(`Recent decisions:\n${fmt(a.decisions)}`);
    if (a.activities.length) blocks.push(`Recent activity:\n${fmt(a.activities)}`);
    if (a.knowledge.length) blocks.push(`Knowledge:\n${fmt(a.knowledge)}`);
    if (!blocks.length) return base;
    return `${base}\n\nShared context from Julius (the AIOS organizational brain) — use it to inform your answer:\n${blocks.join("\n\n")}`;
  } catch {
    return base;
  }
}

async function getOrCreateOperatorConversation(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("contact", "life-operator")
    .maybeSingle();

  if (existing?.id) return existing.id;

const { data: channel, error: channelError } = await supabase
    .from("channels")
    .insert({
      user_id: userId,
      kind: "web_chat",
      name: "Life Operator",
      status: "connected",
    })
    .select("id")
    .single();

  if (channelError || !channel?.id) {
    console.error("[operator-actions] channel insert failed", channelError);
    return null;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      channel_id: channel.id,
      contact: "life-operator",
      subject: "Life Operator",
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (conversationError || !conversation?.id) {
    console.error("[operator-actions] conversation insert failed", conversationError);
    return null;
  }

  return conversation.id;
}

async function saveOperatorMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  conversationId: string,
  direction: "inbound" | "outbound",
  body: string,
  status: "received" | "sent" = direction === "inbound" ? "received" : "sent",
) {
  await supabase.from("messages").insert({
  user_id: userId,
  conversation_id: conversationId,
  direction,
  body,
  status,
  read_at: direction === "outbound" ? null : new Date().toISOString(),
});

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);
}

async function persistOperatorReply(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  conversationId: string,
  result: OperatorResult,
) {
  await saveOperatorMessage(
    supabase,
    userId,
    conversationId,
    "outbound",
    result.reply,
  );

  return result;
}

export async function loadOperatorMessages() {
  const user = await requireUser();
  const supabase = await createClient();
  const conversationId = await getOrCreateOperatorConversation(
    supabase,
    user.id,
  );
await supabase
  .from("messages")
  .update({ read_at: new Date().toISOString() })
  .eq("user_id", user.id)
  .eq("conversation_id", conversationId)
  .eq("direction", "outbound")
  .is("read_at", null);
  const { data } = await supabase
    .from("messages")
    .select("id,direction,body,created_at")
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  return (data ?? []).map((message) => ({
    id: message.id,
    role: message.direction === "inbound" ? "user" : "assistant",
    text: message.body,
  }));
}

/**
 * The Life Operator. Detects intent and either performs a concrete action
 * (create task/goal), produces a transparent rule-based answer (summarize /
 * suggest), or — only when a real provider is configured — calls the AI for
 * free-form questions. With no provider configured it stays fully functional
 * via the rule-based paths.
 */
export async function runOperator(input: string): Promise<OperatorResult> {
  const to = await getTranslations("operator");
  const ta = await getTranslations("advisor");
  const user = await requireUser();
  const text = (input ?? "").trim();
  if (!text) return { intent: "general", reply: to("empty") };
  // Cap input length to bound AI token cost / abuse (no rate limiter yet — #43).
  if (text.length > LIMITS.operatorInput) {
    return { intent: "general", reply: to("tooLong") };
  }

  const supabase = await createClient();
  const conversationId = await getOrCreateOperatorConversation(
    supabase,
    user.id,
  );

  if (!conversationId) {
    return { intent: "general", reply: to("capabilities") };
  }

  await saveOperatorMessage(
    supabase,
    user.id,
    conversationId,
    "inbound",
    text,
  );

  const { intent, title } = detectIntent(text);
  if (intent === "execution_request") {
  const formData = new FormData();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!company?.id) {
    return persistOperatorReply(
      supabase,
      user.id,
      conversationId,
      {
        intent: "general",
        reply:
          "Harmony needs a company before she can delegate business work.",
      },
    );
  }

  formData.set("company_id", company.id);
  formData.set("title", title ?? text);
  formData.set("description", text);

  const result = await delegateToHarmony(
    { status: "success" },
    formData,
  );

  return persistOperatorReply(
    supabase,
    user.id,
    conversationId,
    {
      intent: "execution_request",
      reply: result.message ?? "Harmony delegated the work.",
      actionTaken: {
        type: "work_delegated",
        label: title ?? text,
      },
    },
  );
}
  // Founder Business Harmony
        const lowerText = text.toLowerCase();

    if (
      lowerText.startsWith("business:") ||
      lowerText.startsWith("company:") ||
      lowerText.startsWith("harmony:") ||
      lowerText.includes("repo:")
    ) {
      const formData = new FormData();


const { data: company } = await supabase
  .from("companies")
  .select("id")
  .eq("user_id", user.id)
  .limit(1)
  .maybeSingle();

if (!company?.id) {
  return {
    intent: "general",
    reply:
      "Harmony needs a company before she can delegate business work.",
  };
}

formData.set("company_id", company!.id);
formData.set("title", text);
formData.set("description", text);

const result = await delegateToHarmony(
  { status: "success" },
  formData
);

return {
  intent: "general",
  reply: result.message ?? "Harmony finished delegation.",
};
    }

// Founder Harmony: autonomous by default.
// High-risk actions still require approval through requiresApproval(...).
const effectiveAutonomy: AutonomyLevel = 4;
const mustApprove = requiresApproval(effectiveAutonomy);

if (intent === "create_task") {
  if (!title) return { intent, reply: to("needTaskTitle") };

  if (!mustApprove) {
    return confirmOperatorAction("create_task", title);
  }

  return {
    intent,
    reply: to("proposeTask", { title }),
    proposedAction: { type: "create_task", title },
  };
}

if (intent === "create_goal") {
  if (!title) return { intent, reply: to("needGoalTitle") };

  if (!mustApprove) {
    return confirmOperatorAction("create_goal", title);
  }

  return {
    intent,
    reply: to("proposeGoal", { title }),
    proposedAction: { type: "create_goal", title },
  };
}



  if (intent === "summarize_notes") {
    const { data } = await supabase
      .from("personal_notes")
      .select("title,content")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    const notes = (data as { title: string; content: string }[] | null) ?? [];
    if (!notes.length) return { intent, reply: to("noNotes") };

    if (isRealProviderConfigured()) {
      const prompt = `${to("summaryPrompt")}\n\n${notes
        .map((n, i) => `${i + 1}. ${n.title}: ${n.content}`)
        .join("\n")}`;
      const reply = await getProvider().generate(
        prompt,
        await harmonySystemPrompt(to("system"), user.id),
      );
 return persistOperatorReply(
   supabase,
   user.id,
   conversationId,
   { intent, reply },
 );
    }

    const lines = notes.slice(0, 8).map((n) => `• ${n.title || "Untitled"}`);
    return {
      intent,
      reply: `${to("summaryIntro", { count: notes.length })}\n${lines.join("\n")}`,
    };
  }

  if (intent === "suggest_next_steps") {
    const [tasksRes, goalsRes, notesRes] = await Promise.all([
      supabase.from("personal_tasks").select("*").eq("user_id", user.id).limit(200),
      supabase.from("personal_goals").select("*").eq("user_id", user.id).limit(200),
      supabase.from("personal_notes").select("*").eq("user_id", user.id).limit(200),
    ]);
    const recs = buildRecommendations({
      tasks: (tasksRes.data as PersonalTask[] | null) ?? [],
      goals: (goalsRes.data as PersonalGoal[] | null) ?? [],
      notes: (notesRes.data as PersonalNote[] | null) ?? [],
    });
    const lines = recs
      .slice(0, 4)
      .map((r) => `• ${ta(`rec.${r.key}`, r.values ?? {})}`);
    return { intent, reply: `${to("suggestIntro")}\n${lines.join("\n")}` };
  }

  // Free-form question.
  if (isRealProviderConfigured()) {
    const reply = await getProvider().generate(
      text,
      await harmonySystemPrompt(to("system"), user.id),
    );
    return persistOperatorReply(
      supabase,
      user.id,
      conversationId,
      { intent: "general", reply },
    );
  }
  return persistOperatorReply(
    supabase,
    user.id,
    conversationId,
    { intent: "general", reply: to("capabilities") },
  );
}
/** Executes a previously-proposed Operator write, after the user confirms. */
export async function confirmOperatorAction(
  type: "create_task" | "create_goal",
  title: string,
): Promise<OperatorResult> {
  const to = await getTranslations("operator");
  const user = await requireUser();
  const clean = (title ?? "").trim().slice(0, LIMITS.title);
  if (!clean) return { intent: "general", reply: to("empty") };

  const supabase = await createClient();
  if (type === "create_task") {
    await supabase
      .from("personal_tasks")
      .insert({ user_id: user.id, title: clean });
    revalidatePath("/harmony");
    revalidatePath("/harmony/tasks");
    return {
      intent: "create_task",
      reply: to("taskCreated", { title: clean }),
      actionTaken: { type: "task_created", label: clean },
    };
  }

  await supabase
    .from("personal_goals")
    .insert({ user_id: user.id, title: clean });
  revalidatePath("/harmony");
  revalidatePath("/harmony/goals");
  return {
    intent: "create_goal",
    reply: to("goalCreated", { title: clean }),
    actionTaken: { type: "goal_created", label: clean },
  };
}
