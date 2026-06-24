"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getAiosAgent, AIOS_WORKFORCE } from "@/lib/workforce/registry";
import { TIER_PRESETS, SAFE_OPEN_CATEGORIES, tierOf } from "@/lib/workforce/autonomy-tiers";
import { createClient } from "@/lib/supabase/server";
import { listWorkItems, setWorkItemStatus } from "@/lib/workforce/work-queue";
import {
  ACTION_CATEGORIES,
  isRestrictedCategory,
  deriveRiskLevel,
  evaluate,
  getAutonomyState,
  recordAutonomyDecision,
  listAutonomyAudit,
  type ActionCategory,
  type AutonomyMode,
  type Threshold,
} from "@/lib/workforce/autonomy";
import type { ActionState } from "@/lib/types";

const MODES: AutonomyMode[] = ["off", "advisory", "bounded"];
const THRESHOLDS: Threshold[] = ["none", "low", "medium"];
const okMode = (v: string): AutonomyMode => (MODES as string[]).includes(v) ? (v as AutonomyMode) : "off";
const okThreshold = (v: string): Threshold => (THRESHOLDS as string[]).includes(v) ? (v as Threshold) : "none";
const toInt = (v: FormDataEntryValue | null): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Global autonomy controls: mode, kill switch, lockdown, threshold, limits. */
export async function updateGlobalAutonomy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("agent_autonomy_global").upsert(
    {
      user_id: user.id,
      mode: okMode(String(formData.get("mode") ?? "off")),
      kill_switch: formData.get("kill_switch") === "on",
      lockdown: formData.get("lockdown") === "on",
      auto_execute_threshold: okThreshold(String(formData.get("auto_execute_threshold") ?? "none")),
      max_actions_per_hour: toInt(formData.get("max_actions_per_hour")),
      max_delegation_depth: toInt(formData.get("max_delegation_depth")),
      notify_on_medium: formData.get("notify_on_medium") === "on",
    },
    { onConflict: "user_id" },
  );
  if (error) return { status: "error", message: t("errors.generic") };
  revalidatePath("/harmony/autonomy");
  return { status: "success", message: "" };
}

/** Per-agent autonomy: mode, threshold override, daily/monthly budgets. */
export async function updateAgentAutonomy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const agent = String(formData.get("agent") ?? "");
  if (!getAiosAgent(agent)) return { status: "error", message: t("errors.generic") };
  const thresholdRaw = String(formData.get("auto_execute_threshold") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("agent_autonomy_settings").upsert(
    {
      user_id: user.id,
      agent,
      mode: okMode(String(formData.get("mode") ?? "off")),
      auto_execute_threshold: thresholdRaw ? okThreshold(thresholdRaw) : null,
      daily_action_limit: toInt(formData.get("daily_action_limit")),
      monthly_action_limit: toInt(formData.get("monthly_action_limit")),
    },
    { onConflict: "user_id,agent" },
  );
  if (error) return { status: "error", message: t("errors.generic") };
  revalidatePath("/harmony/autonomy");
  return { status: "success", message: "" };
}

/** Per-category policy. Restricted categories are FORCED approval-only here. */
export async function updateCategoryPolicy(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const category = String(formData.get("category") ?? "");
  if (!(ACTION_CATEGORIES as readonly string[]).includes(category)) {
    return { status: "error", message: t("errors.generic") };
  }
  const restricted = isRestrictedCategory(category);
  const supabase = await createClient();
  const { error } = await supabase.from("agent_autonomy_categories").upsert(
    {
      user_id: user.id,
      category,
      // Hard guard: restricted categories can never be opened for autonomy.
      auto_allowed: restricted ? false : formData.get("auto_allowed") === "on",
      requires_approval: restricted ? true : formData.get("requires_approval") === "on",
      max_risk: restricted ? "none" : okThreshold(String(formData.get("max_risk") ?? "none")),
    },
    { onConflict: "user_id,category" },
  );
  if (error) return { status: "error", message: t("errors.generic") };
  revalidatePath("/harmony/autonomy");
  return { status: "success", message: "" };
}

/**
 * Founder-triggered autonomy pass over proposed work. Evaluates each item, writes
 * the decision to the audit trail, and — only for items that are auto-eligible
 * AND within the agent's daily budget — advances the work item to 'approved'
 * (internal status only; no external side effect). Everything else is recorded
 * and left for the founder. There is NO background drainer; this runs only when
 * the founder clicks it.
 */
export async function runAutonomyPass(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const state = await getAutonomyState(user.id);

  const items = await listWorkItems(user.id, { companyId, status: "proposed", limit: 200 });

  // Today's auto-action burn per agent (for budget enforcement).
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const usedToday: Record<string, number> = {};
  for (const a of await listAutonomyAudit(user.id, 500)) {
    if ((a.decision === "auto_executed" || a.decision === "notified") && new Date(a.created_at) >= todayStart) {
      usedToday[a.agent] = (usedToday[a.agent] ?? 0) + 1;
    }
  }

  for (const it of items) {
    const riskLevel = deriveRiskLevel(it.risk, it.risk_level);
    const category = (it.category ?? null) as ActionCategory | null;
    let decision: ReturnType<typeof evaluate>;
    if (!category) {
      decision = { decision: "pending_approval", reason: "No action category set." };
    } else {
      decision = evaluate({
        category,
        riskLevel,
        global: state.global,
        agent: state.agents[it.agent] ?? null,
        categoryPolicy: state.categories[category] ?? null,
      });
    }

    // Budget gate: even auto-eligible items wait if the agent's daily budget is spent.
    if (decision.decision === "auto_executed" || decision.decision === "notified") {
      const limit = state.agents[it.agent]?.daily_action_limit ?? 0;
      if ((usedToday[it.agent] ?? 0) >= limit) {
        decision = { decision: "pending_approval", reason: "Daily autonomy budget exhausted." };
      }
    }

    await recordAutonomyDecision({
      userId: user.id,
      companyId,
      agent: it.agent,
      action: it.title,
      category,
      riskLevel,
      decision: decision.decision,
      detail: decision.reason,
      refType: "agent_work_item",
      refId: it.id,
    });

    if (decision.decision === "auto_executed" || decision.decision === "notified") {
      // Phase B: autonomously complete safe internal work (status only — the
      // audit row is the execution log). Restricted categories and HIGH/CRITICAL
      // never reach this branch, so nothing external/irreversible is touched.
      await setWorkItemStatus(user.id, it.id, "done");
      usedToday[it.agent] = (usedToday[it.agent] ?? 0) + 1;
    }
  }

  revalidatePath("/harmony/autonomy");
  revalidatePath("/harmony/work");
  return { status: "success", message: "" };
}

/**
 * Apply tier default presets (Tier 1/2/3) to per-agent settings and open the
 * safe global categories. Does NOT enable the global master switch — the
 * founder still sets Global mode = Bounded to activate. Never opens a restricted
 * category. One-click setup; fully reversible from the controls.
 */
export async function applyTierDefaults(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const supabase = await createClient();

  const agentRows = AIOS_WORKFORCE.map((a) => {
    const p = TIER_PRESETS[tierOf(a.key)];
    return {
      user_id: user.id,
      agent: a.key,
      mode: p.mode,
      auto_execute_threshold: p.threshold === "none" ? null : p.threshold,
      daily_action_limit: p.daily,
      monthly_action_limit: p.monthly,
    };
  });
  const { error: e1 } = await supabase
    .from("agent_autonomy_settings")
    .upsert(agentRows, { onConflict: "user_id,agent" });

  const catRows = (SAFE_OPEN_CATEGORIES as readonly string[]).map((c) => ({
    user_id: user.id,
    category: c,
    auto_allowed: true,
    requires_approval: false,
    max_risk: "medium",
  }));
  const { error: e2 } = await supabase
    .from("agent_autonomy_categories")
    .upsert(catRows, { onConflict: "user_id,category" });

  if (e1 || e2) return { status: "error", message: t("errors.generic") };
  revalidatePath("/harmony/autonomy");
  return { status: "success", message: "" };
}
