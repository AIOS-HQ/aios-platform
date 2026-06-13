"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { detectIntent } from "@/lib/ai/intents";
import { getProvider, isRealProviderConfigured } from "@/lib/ai/provider";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { LIMITS } from "@/lib/limits";
import { requiresApproval, type AutonomyLevel } from "@/lib/harmony/os/autonomy";
import type { OperatorResult } from "@/lib/ai/types";
import type { PersonalGoal, PersonalNote, PersonalTask } from "@/types/database";

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

  const { intent, title } = detectIntent(text);

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

  const supabase = await createClient();

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
      const reply = await getProvider().generate(prompt, to("system"));
      return { intent, reply };
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
    const reply = await getProvider().generate(text, to("system"));
    return { intent: "general", reply };
  }
  return { intent: "general", reply: to("capabilities") };
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
