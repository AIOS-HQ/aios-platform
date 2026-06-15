import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { getProvider } from "@/lib/ai/provider";
import { emitActivity } from "@/lib/harmony/os/events";
import { runConnectorCapability } from "@/lib/integrations/connector-runtime";
import {
  clampAutonomy,
  requiresApproval,
  resolveAutonomy,
  type AutonomyLevel,
} from "@/lib/harmony/os/autonomy";
import { LIMITS } from "@/lib/limits";
import type { WorkItem } from "@/types/database";

export type ExecutionOutcome =
  | "completed"
  | "awaiting_approval"
  | "blocked";
/**
 * Run a work item through its department's autonomy policy — the heart of the
 type GithubIntent = {
  capabilityId: string;
  params: Record<string, unknown>;
};

function matchValue(text: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*[:=]\\s*([^\\n]+)`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() || null;
}

function inferGithubIntent(item: WorkItem): GithubIntent | null {
  const text = `${item.title}\n${item.description ?? ""}`.trim();
  const lower = text.toLowerCase();

  const repo =
    matchValue(text, "repo") ??
    process.env.HARMONY_DEFAULT_GITHUB_REPO ??
    process.env.GITHUB_DEFAULT_REPO ??
    null;

  if (!repo) return null;

  if (/(create|open)\s+(a\s+)?(github\s+)?issue/.test(lower)) {
    return {
      capabilityId: "create_issue",
      params: {
        repo,
        title: matchValue(text, "issue title") ?? item.title,
        body: item.description ?? undefined,
      },
    };
  }

  if (/(create|new)\s+(a\s+)?branch/.test(lower)) {
    const branch = matchValue(text, "branch");
    if (!branch) return null;

    return {
      capabilityId: "create_branch",
      params: {
        repo,
        branch,
        base: matchValue(text, "base") ?? undefined,
      },
    };
  }

  if (/(open|create)\s+(a\s+)?(pull request|pr)/.test(lower)) {
    const head = matchValue(text, "head") ?? matchValue(text, "branch");
    if (!head) return null;

    return {
      capabilityId: "open_pull_request",
      params: {
        repo,
        head,
        base: matchValue(text, "base") ?? undefined,
        title: matchValue(text, "pr title") ?? item.title,
        body: item.description ?? undefined,
      },
    };
  }

  if (/(commit|update|create)\s+(a\s+)?file/.test(lower)) {
    const path = matchValue(text, "path");
    const branch = matchValue(text, "branch");
    const content = matchValue(text, "content");

    if (!path || !branch || !content) return null;

    return {
      capabilityId: "commit_file_to_branch",
      params: {
        repo,
          // Execute via GitHub connector when Harmony can infer a GitHub intent.
  const githubIntent = inferGithubIntent(item);

  if (githubIntent) {
    await supabase
      .from("work_items")
      .update({ status: "in_progress" })
      .eq("id", item.id)
      .eq("user_id", userId);

    const connectorResult = await runConnectorCapability(
      userId,
      "github",
      githubIntent.capabilityId,
      githubIntent.params,
      { approved: opts?.force },
    );

    const note = `\n\n${to("execution.resultLabel")}\n${JSON.stringify(
      connectorResult,
      null,
      2,
    )}`;

    const description = `${item.description ?? ""}${note}`.slice(
      0,
      LIMITS.noteContent,
    );

    if (connectorResult.status === "pending") {
      await supabase
        .from("work_items")
        .update({ status: "awaiting_approval", description })
        .eq("id", item.id)
        .eq("user_id", userId);

      await emitActivity({
        userId,
        companyId: item.company_id,
        departmentId: item.department_id,
        actorType: "agent",
        actorId: item.agent_id,
        kind: "approval",
        summary: to("activity.workRouted", { title: item.title }),
        refType: "work_item",
        refId: item.id,
      });

      return "awaiting_approval";
    }

    if (!connectorResult.ok) {
      await supabase
        .from("work_items")
        .update({ status: "blocked", description })
        .eq("id", item.id)
        .eq("user_id", userId);

      await emitActivity({
        userId,
        companyId: item.company_id,
        departmentId: item.department_id,
        actorType: "agent",
        actorId: item.agent_id,
        kind: "system",
        summary: `Harmony blocked GitHub work: ${item.title}`,
        refType: "work_item",
        refId: item.id,
      });

      return "blocked";
    }

    await supabase
      .from("work_items")
      .update({ status: "completed", description })
      .eq("id", item.id)
      .eq("user_id", userId);

    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      actorType: "agent",
      actorId: item.agent_id,
      kind: "agent_action",
      summary: to("activity.workCompleted", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });

    return "completed";
  }

  // Fallback: execute via active provider when no connector intent is inferred.
  await supabase
    .from("work_items")
    .update({ status: "in_progress" })
    .eq("id", item.id)
    .eq("user_id", userId);

  let result: string;
  try {
    const system = to("execution.system", { department: departmentName || "Harmony" });
    const prompt = `${item.title}\n\n${item.description ?? ""}`.trim();
    result = await getProvider().generate(prompt, system);
  } catch (err) {
    console.error("[execution] provider.generate failed", err);
    result = to("execution.failed");

    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      kind: "system",
      summary: to("activity.providerError", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });
  }

  const note = `\n\n${to("execution.resultLabel")}\n${result}`;
  const description = `${item.description ?? ""}${note}`.slice(
    0,
    LIMITS.noteContent,
  );

  await supabase
    .from("work_items")
    .update({ status: "completed", description })
    .eq("id", item.id)
    .eq("user_id", userId);

  await emitActivity({
    userId,
    companyId: item.company_id,
    departmentId: item.department_id,
    actorType: "agent",
    actorId: item.agent_id,
    kind: "agent_action",
    summary: to("activity.workCompleted", { title: item.title }),
    refType: "work_item",
    refId: item.id,
  });

  return "completed";
      .from("agents")
      .select("autonomy_level")
      .eq("id", item.agent_id)
      .maybeSingle();
    const agent = data as { autonomy_level: number | null } | null;
    if (agent && agent.autonomy_level != null) {
      level = resolveAutonomy(level, clampAutonomy(agent.autonomy_level));
    }
  }

  // Gate below Autonomous.
  if (!opts?.force && requiresApproval(level)) {
    await supabase
      .from("work_items")
      .update({ status: "awaiting_approval" })
      .eq("id", item.id)
      .eq("user_id", userId);
    await supabase.from("approvals").insert({
      user_id: userId,
      company_id: item.company_id,
      department_id: item.department_id,
      agent_id: item.agent_id,
      work_item_id: item.id,
      type: "content",
      title: item.title,
      summary: item.description,
      risk: item.priority,
    });
    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      kind: "approval",
      summary: to("activity.workRouted", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });
    return "awaiting_approval";
  }

  // Execute via the active provider (real AI when configured; mock otherwise).
  await supabase
    .from("work_items")
    .update({ status: "in_progress" })
    .eq("id", item.id)
    .eq("user_id", userId);

  let result: string;
  try {
    const system = to("execution.system", { department: departmentName || "Harmony" });
    const prompt = `${item.title}\n\n${item.description ?? ""}`.trim();
    result = await getProvider().generate(prompt, system);
  } catch (err) {
    console.error("[execution] provider.generate failed", err);
    result = to("execution.failed");
    // Provider health monitoring: surface failures in the audit feed.
    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      kind: "system",
      summary: to("activity.providerError", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });
  }

  const note = `\n\n${to("execution.resultLabel")}\n${result}`;
  const description = `${item.description ?? ""}${note}`.slice(0, LIMITS.noteContent);
  await supabase
    .from("work_items")
    .update({ status: "completed", description })
    .eq("id", item.id)
    .eq("user_id", userId);
  await emitActivity({
    userId,
    companyId: item.company_id,
    departmentId: item.department_id,
    actorType: "agent",
    actorId: item.agent_id,
    kind: "agent_action",
    summary: to("activity.workCompleted", { title: item.title }),
    refType: "work_item",
    refId: item.id,
  });
  return "completed";
}
