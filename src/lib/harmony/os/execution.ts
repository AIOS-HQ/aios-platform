import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { getProvider } from "@/lib/ai/provider";
import { consultCompanySkills, formatSkillContext } from "@/lib/company-skills/utilization";
import { emitActivity } from "@/lib/harmony/os/events";
import {
  buildOrganizationalIntelligence,
  formatOrganizationalContext,
} from "@/lib/organizational-intelligence/engine";
import {
  buildAdaptiveExecutionPlan,
  formatAdaptivePlan,
} from "@/lib/harmony/adaptive-planning";
import { runConnectorCapability, type ConnectorRunResult } from "@/lib/integrations/connector-runtime";
import { handleMasonEngineeringMessage } from "@/lib/workforce/mason-action";
import {
  clampAutonomy,
  requiresApproval,
  resolveAutonomy,
  type AutonomyLevel,
} from "@/lib/harmony/os/autonomy";
import { LIMITS } from "@/lib/limits";
import { createApprovalPayload } from "@/lib/harmony/autonomy/data-access";
import { buildWorkItemApprovalPayload } from "@/lib/harmony/autonomy/work-approval";
import type { WorkItem } from "@/types/database";

export type ExecutionOutcome = "completed" | "awaiting_approval" | "blocked";

type GithubIntent = {
  capabilityId: string;
  params: Record<string, unknown>;
};

function matchValue(text: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*[:=]\\s*([^\\n]+)`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() || null;
}

function isMasonEngineeringWork(item: WorkItem): boolean {
  const text = `${item.title}\n${item.description ?? ""}`.toLowerCase();

  return (
    text.includes("mason") ||
    text.includes("github") ||
    text.includes("repo:") ||
    text.includes("branch") ||
    text.includes("pull request") ||
    text.includes("pr ") ||
    text.includes("commit") ||
    text.includes("code") ||
    text.includes("runtime") ||
    text.includes("bug") ||
    text.includes("fix")
  );
}

function matchRepo(text: string): string | null {
  const explicit = text.match(/\brepo\s*[:=]\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  if (explicit?.[1]) return explicit[1].trim();

  const natural = text.match(/\b(?:in|for|inside)\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i);
  return natural?.[1]?.trim() || null;
}

function cleanGithubIssueTitle(text: string, fallback: string): string {
  const explicit = matchValue(text, "issue title");
  if (explicit) {
    return explicit
      .replace(/\brepo\s*[:=]\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i, "")
      .replace(/\bin\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i, "")
      .trim();
  }

  const quoted = text.match(/\b(?:titled|title)\s+["“]([^"”\n]+)["”]/i)?.[1]?.trim();
  if (quoted) return quoted.slice(0, 160);

  return (
    fallback
      .replace(/\brepo\s*[:=]\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i, "")
      .replace(/\bin\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i, "")
      .replace(/\b(create|open)\s+(a\s+)?(github\s+)?issue\b/i, "")
      .replace(/\bask\s+mason\s+to\b/i, "")
      .trim() || "Harmony GitHub issue"
  ).slice(0, 160);
}

function inferGithubIntent(item: WorkItem): GithubIntent | null {
  const text = `${item.title}\n${item.description ?? ""}`.trim();
  const lower = text.toLowerCase();

  const repo =
    matchRepo(text) ??
    process.env.HARMONY_DEFAULT_GITHUB_REPO ??
    process.env.GITHUB_DEFAULT_REPO ??
    null;

  if (!repo) return null;

  if (/(create|open)\s+(a\s+)?(github\s+)?issue/.test(lower)) {
    return {
      capabilityId: "create_issue",
      params: {
        repo,
        title: cleanGithubIssueTitle(text, item.title),
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
        path,
        branch,
        content,
        message: matchValue(text, "message") ?? `Harmony update ${path}`,
      },
    };
  }

  return null;
}

async function getOrCreateLifeOperatorConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .eq("contact", "life-operator")
    .maybeSingle();

  if (existing?.id) return existing.id as string;

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
    console.error("[execution] operator channel create failed", channelError);
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
    console.error("[execution] operator conversation create failed", conversationError);
    return null;
  }

  return conversation.id as string;
}

async function postLifeOperatorMessage(
  supabase: SupabaseClient,
  userId: string,
  body: string,
): Promise<void> {
  const conversationId = await getOrCreateLifeOperatorConversation(supabase, userId);
  if (!conversationId) return;

  await supabase.from("messages").insert({
    user_id: userId,
    conversation_id: conversationId,
    direction: "outbound",
    body: body.slice(0, LIMITS.noteContent),
    status: "sent",
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);
}

function summarizeConnectorResult(item: WorkItem, connectorResult: ConnectorRunResult): string {
  const data = connectorResult.data ?? {};
  const number = data.number ?? data.issueNumber ?? data.pullRequestNumber;
  const url = data.url ?? data.htmlUrl ?? data.issueUrl ?? data.pullRequestUrl;
  const title = data.title ?? item.title;

  if (connectorResult.ok) {
    return [
      `Harmony completed: ${item.title}`,
      "",
      `GitHub action: ${connectorResult.message}`,
      number ? `Number: ${String(number)}` : null,
      url ? `URL: ${String(url)}` : null,
      `Title: ${String(title)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Harmony blocked: ${item.title}`,
    "",
    `GitHub action failed: ${connectorResult.message}`,
    `Status: ${connectorResult.status}`,
    "",
    "The work item was preserved as blocked so the exact failure can be inspected and retried.",
  ].join("\n");
}

async function recordExecutionSkill(
  userId: string,
  item: WorkItem,
  outcome: ExecutionOutcome,
  result: string,
): Promise<void> {
  if (!item.company_id) return;
  try {
    const { learnCompanySkill } = await import("@/lib/company-skills/library");
    await learnCompanySkill({
      userId,
      companyId: item.company_id,
      ownerAgent: "harmony",
      title: item.title,
      summary: item.description,
      outcome: result,
      objectiveId: item.objective_id,
      success: outcome === "completed",
      source: "work_item",
      sourceId: item.id,
    });
  } catch (e) {
    console.error("[execution] learnCompanySkill", e);
  }
}

/**
 * Run a work item through its department's autonomy policy — the heart of the
 * Helper Execution System.
 */
export async function executeWorkItem(
  supabase: SupabaseClient,
  userId: string,
  item: WorkItem,
  opts?: { force?: boolean },
): Promise<ExecutionOutcome> {
  const to = await getTranslations("os");

  // Idempotency: never re-run a work item that already completed. Guards against
  // double-execution if both the legacy approval and the new approval_payload for
  // the same item are actioned during the unification transition.
  if (item.status === "completed") {
    return "completed";
  }

  let level: AutonomyLevel = 0;
  let departmentName = "";

  if (item.department_id) {
    const { data } = await supabase
      .from("departments")
      .select("name, autonomy_level")
      .eq("id", item.department_id)
      .maybeSingle();

    const dept = data as { name: string; autonomy_level: number } | null;
    if (dept) {
      level = clampAutonomy(dept.autonomy_level ?? 0);
      departmentName = dept.name ?? "";
    }
  }

  if (item.agent_id) {
    const { data } = await supabase
      .from("agents")
      .select("autonomy_level")
      .eq("id", item.agent_id)
      .maybeSingle();

    const agent = data as { autonomy_level: number | null } | null;
    if (agent && agent.autonomy_level != null) {
      level = resolveAutonomy(level, clampAutonomy(agent.autonomy_level));
    }
  }

  if (!opts?.force && requiresApproval(level)) {
    await supabase
      .from("work_items")
      .update({ status: "awaiting_approval" })
      .eq("id", item.id)
      .eq("user_id", userId);

    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      kind: "approval",
      summary: to("activity.workRouted", { title: item.title }),
      refType: "work_item",
      refId: item.id,
    });

    // Single execution path: the gated work item is recorded as an approval_payload
    // and resumed through the Unified Autonomy Policy Engine's execution spine
    // (Review Queue → approve/reject → resumeApprovedExecution). The legacy
    // `approvals` table write has been retired; the spine is the sole approval path.
    await createApprovalPayload(
      userId,
      item.company_id,
      buildWorkItemApprovalPayload({ id: item.id, title: item.title, companyId: item.company_id }),
    );

    return "awaiting_approval";
  }

  await supabase
    .from("work_items")
    .update({ status: "in_progress" })
    .eq("id", item.id)
    .eq("user_id", userId);

  const organization = await buildOrganizationalIntelligence(userId, item.company_id, { limit: 300 });
  const organizationalContext = formatOrganizationalContext(organization);
  const consultation = await consultCompanySkills({
    userId,
    companyId: item.company_id,
    agent: "harmony",
    purpose: "execution",
    query: `${item.title}\n${item.description ?? ""}`,
    context: { organization },
    sourceType: "work_item",
    sourceId: item.id,
  });
  const skillContext = formatSkillContext(consultation.skills);
  const adaptivePlan = await buildAdaptiveExecutionPlan({
    userId,
    companyId: item.company_id,
    title: item.title,
    detail: item.description,
    agent: "harmony",
    skills: consultation.skills,
    organization,
  });
  const adaptivePlanContext = adaptivePlan ? formatAdaptivePlan(adaptivePlan) : "";

  const githubIntent = inferGithubIntent(item);

  if (githubIntent) {
    const connectorResult = await runConnectorCapability(userId, "github", githubIntent.capabilityId, githubIntent.params, {
      approved: opts?.force,
    });

    const note = `\n\n${to("execution.resultLabel")}\n${JSON.stringify(connectorResult, null, 2)}`;

    const description = `${item.description ?? ""}${
      skillContext ? `\n\nCompany Skills applied before execution:\n${skillContext}` : ""
    }${
      organizationalContext ? `\n\nOrganizational Intelligence considered:\n${organizationalContext}` : ""
    }${
      adaptivePlanContext ? `\n\nAdaptive Planning used before execution:\n${adaptivePlanContext}` : ""
    }${note}`.slice(0, LIMITS.noteContent);

    const reply = summarizeConnectorResult(item, connectorResult);

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

      if (opts?.force) await postLifeOperatorMessage(supabase, userId, reply);
      await recordExecutionSkill(userId, item, "blocked", description);
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

    if (opts?.force) await postLifeOperatorMessage(supabase, userId, reply);
    await recordExecutionSkill(userId, item, "completed", description);

    return "completed";
  }

  if (isMasonEngineeringWork(item)) {
    const text = `${item.title}\n\n${item.description ?? ""}`.trim();

    const masonResult = await handleMasonEngineeringMessage({
      userId,
      companyId: item.company_id,
      repository: matchRepo(text),
      message: text,
      founderApproved: opts?.force === true,
    });

    const masonNote = [
      `Mason status: ${masonResult.status}`,
      `Summary: ${masonResult.summary}`,
      `Pull request: ${masonResult.pullRequestUrl ?? "not returned"}`,
      `Preview: ${masonResult.previewUrl ?? "not returned"}`,
    ].join("\n");

    const description = `${item.description ?? ""}\n\n${to("execution.resultLabel")}\n${masonNote}`.slice(0, LIMITS.noteContent);

    const outcome: ExecutionOutcome = masonResult.status === "completed" ? "completed" : "blocked";

    await supabase
      .from("work_items")
      .update({ status: outcome, description })
      .eq("id", item.id)
      .eq("user_id", userId);

    await emitActivity({
      userId,
      companyId: item.company_id,
      departmentId: item.department_id,
      actorType: "agent",
      actorId: item.agent_id ?? "mason",
      kind: outcome === "completed" ? "agent_action" : "system",
      summary:
        outcome === "completed"
          ? `Mason completed engineering work: ${item.title}`
          : `Mason blocked engineering work: ${item.title}`,
      refType: "work_item",
      refId: item.id,
    });

    if (opts?.force) await postLifeOperatorMessage(supabase, userId, masonNote);
    await recordExecutionSkill(userId, item, outcome, masonNote);

    return outcome;
  }

  let result: string;
  let providerFailed = false;
  try {
    const system = to("execution.system", { department: departmentName || "Harmony" });
    const prompt = `${item.title}\n\n${item.description ?? ""}${
      skillContext ? `\n\nUse these relevant Company Skills before deciding the execution approach:\n${skillContext}` : ""
    }${
      organizationalContext
        ? `\n\nUse these Organizational Intelligence patterns before deciding sequencing, collaboration, and recovery path:\n${organizationalContext}`
        : ""
    }${
      adaptivePlanContext
        ? `\n\nFollow this Adaptive Execution Plan unless the current facts require a safer adjustment:\n${adaptivePlanContext}`
        : ""
    }`.trim();
    result = await getProvider().generate(prompt, system);
  } catch (err) {
    console.error("[execution] provider.generate failed", err);
    providerFailed = true;
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
  const description = `${item.description ?? ""}${note}`.slice(0, LIMITS.noteContent);

  if (providerFailed) {
    await supabase
      .from("work_items")
      .update({ status: "blocked", description })
      .eq("id", item.id)
      .eq("user_id", userId);

    if (opts?.force) await postLifeOperatorMessage(supabase, userId, result);
    await recordExecutionSkill(userId, item, "blocked", description);

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

  if (opts?.force) await postLifeOperatorMessage(supabase, userId, result);

  await recordExecutionSkill(userId, item, "completed", result);

  return "completed";
}
