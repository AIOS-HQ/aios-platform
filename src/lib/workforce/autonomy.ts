import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Bounded Autonomy engine (server-only). Pure decision logic + state loaders +
 * audit writer. This module NEVER performs external/risky actions itself — it
 * only DECIDES (and records) what may happen. The six restricted categories and
 * HIGH/CRITICAL risk always require founder approval, enforced here in code on
 * top of the DB policy rows. Defaults are behaviour-neutral (mode 'off').
 */

export const ACTION_CATEGORIES = [
  "financial",
  "code",
  "security",
  "architecture",
  "publishing",
  "destructive",
  "operational",
  "communications",
  "research",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

/** Categories that ALWAYS require founder approval — never auto-executed. */
export const RESTRICTED_CATEGORIES: readonly ActionCategory[] = [
  "financial",
  "code",
  "security",
  "architecture",
  "publishing",
  "destructive",
];

export function isRestrictedCategory(c: string): boolean {
  return (RESTRICTED_CATEGORIES as readonly string[]).includes(c);
}

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type AutonomyMode = "off" | "advisory" | "bounded";
export type Threshold = "none" | "low" | "medium";
export type AutonomyDecision =
  | "auto_executed"
  | "notified"
  | "pending_approval"
  | "denied"
  | "kill_switch"
  | "lockdown";

const RISK_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const THRESHOLD_RANK: Record<Threshold, number> = { none: 0, low: 1, medium: 2 };
const MODE_RANK: Record<AutonomyMode, number> = { off: 0, advisory: 1, bounded: 2 };

export interface AutonomyGlobal {
  mode: AutonomyMode;
  kill_switch: boolean;
  lockdown: boolean;
  auto_execute_threshold: Threshold;
  max_actions_per_hour: number;
  max_delegation_depth: number;
  require_audit: boolean;
  notify_on_medium: boolean;
}

export interface AutonomyAgentSetting {
  agent: string;
  mode: AutonomyMode;
  auto_execute_threshold: Threshold | null;
  max_delegation_depth: number | null;
  daily_action_limit: number;
  monthly_action_limit: number;
}

export interface CategoryPolicy {
  category: ActionCategory;
  auto_allowed: boolean;
  requires_approval: boolean;
  max_risk: Threshold;
}

export const DEFAULT_GLOBAL: AutonomyGlobal = {
  mode: "off",
  kill_switch: false,
  lockdown: false,
  auto_execute_threshold: "none",
  max_actions_per_hour: 0,
  max_delegation_depth: 1,
  require_audit: true,
  notify_on_medium: true,
};

/** Resolve a risk level: explicit column wins, else derive from legacy `risk`. */
export function deriveRiskLevel(risk: string, riskLevel?: string | null): RiskLevel {
  if (riskLevel && (RISK_LEVELS as readonly string[]).includes(riskLevel)) return riskLevel as RiskLevel;
  if (risk === "destructive") return "critical";
  if (risk === "approval") return "high";
  return "low";
}

export interface AutonomyState {
  global: AutonomyGlobal;
  agents: Record<string, AutonomyAgentSetting>;
  categories: Record<string, CategoryPolicy>;
}

export async function getAutonomyState(userId: string): Promise<AutonomyState> {
  if (!userId) return { global: DEFAULT_GLOBAL, agents: {}, categories: {} };
  const supabase = await createClient();
  const [g, s, c] = await Promise.all([
    supabase.from("agent_autonomy_global").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("agent_autonomy_settings").select("*").eq("user_id", userId),
    supabase.from("agent_autonomy_categories").select("*").eq("user_id", userId),
  ]);
  const global = (g.data as AutonomyGlobal | null) ?? DEFAULT_GLOBAL;
  const agents: Record<string, AutonomyAgentSetting> = {};
  for (const row of (s.data as AutonomyAgentSetting[] | null) ?? []) agents[row.agent] = row;
  const categories: Record<string, CategoryPolicy> = {};
  for (const row of (c.data as CategoryPolicy[] | null) ?? []) categories[row.category] = row;
  return { global, agents, categories };
}

export interface EvalInput {
  category: ActionCategory;
  riskLevel: RiskLevel;
  global: AutonomyGlobal;
  agent?: AutonomyAgentSetting | null;
  categoryPolicy?: CategoryPolicy | null;
}
export interface EvalResult {
  decision: AutonomyDecision;
  reason: string;
}

/**
 * The core decision function. Evaluates BOTH risk level and category against the
 * global + per-agent + category policy. Never returns auto_executed for a
 * restricted category or HIGH/CRITICAL risk.
 */
export function evaluate(input: EvalInput): EvalResult {
  const { category, riskLevel, global, agent, categoryPolicy } = input;

  if (global.kill_switch) return { decision: "kill_switch", reason: "Global kill switch is engaged." };
  if (global.lockdown) return { decision: "lockdown", reason: "Founder lockdown is active." };

  // Effective mode = the MORE RESTRICTIVE of global and per-agent.
  const mode: AutonomyMode = agent
    ? MODE_RANK[agent.mode] <= MODE_RANK[global.mode]
      ? agent.mode
      : global.mode
    : global.mode;

  if (mode === "off") return { decision: "denied", reason: "Autonomy is off." };
  if (mode === "advisory") return { decision: "pending_approval", reason: "Advisory mode — founder approval required." };
  if (global.max_actions_per_hour <= 0)
    return { decision: "pending_approval", reason: "No hourly autonomy budget configured." };

  // bounded mode — hard invariants first
  if (isRestrictedCategory(category))
    return { decision: "pending_approval", reason: `Restricted category '${category}' always requires approval.` };
  if (riskLevel === "high" || riskLevel === "critical")
    return { decision: "pending_approval", reason: `${riskLevel.toUpperCase()} risk always requires approval.` };
  if (!categoryPolicy || !categoryPolicy.auto_allowed || categoryPolicy.requires_approval)
    return { decision: "pending_approval", reason: `Category '${category}' is not opened for autonomy.` };

  // Effective threshold = the lowest of global / agent / category.max_risk.
  const agentThreshold = agent?.auto_execute_threshold ?? global.auto_execute_threshold;
  const effThresholdRank = Math.min(
    THRESHOLD_RANK[global.auto_execute_threshold],
    THRESHOLD_RANK[agentThreshold],
    THRESHOLD_RANK[categoryPolicy.max_risk],
  );
  if (effThresholdRank === 0) return { decision: "pending_approval", reason: "Auto-execute threshold is none." };
  if (RISK_RANK[riskLevel] > effThresholdRank)
    return { decision: "pending_approval", reason: `Risk '${riskLevel}' exceeds the auto-execute threshold.` };

  // Budgets: 0 = blocked. (Actual burn vs limit is enforced at apply time.)
  if (!agent || agent.daily_action_limit <= 0 || agent.monthly_action_limit <= 0)
    return { decision: "pending_approval", reason: "No autonomy budget configured for this agent." };

  if (riskLevel === "medium" && global.notify_on_medium)
    return { decision: "notified", reason: "Auto-executed with notification (medium risk)." };
  return { decision: "auto_executed", reason: "Within autonomy policy." };
}

export async function recordAutonomyDecision(params: {
  userId: string;
  companyId: string | null;
  agent: string;
  action: string;
  category: ActionCategory | null;
  riskLevel: RiskLevel | null;
  decision: AutonomyDecision;
  detail?: string;
  refType?: string;
  refId?: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("agent_autonomy_audit").insert({
    user_id: params.userId,
    company_id: params.companyId,
    agent: params.agent,
    action: params.action.slice(0, 300),
    category: params.category,
    risk_level: params.riskLevel,
    decision: params.decision,
    detail: params.detail?.slice(0, 2000) ?? null,
    ref_type: params.refType ?? null,
    ref_id: params.refId ?? null,
  });
  if (error) console.error("[workforce/autonomy] audit", error.message);
}

export interface AutonomyAuditRow {
  id: string;
  agent: string;
  action: string;
  category: string | null;
  risk_level: string | null;
  decision: AutonomyDecision;
  detail: string | null;
  created_at: string;
}

export async function listAutonomyAudit(userId: string, limit = 100): Promise<AutonomyAuditRow[]> {
  if (!userId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_autonomy_audit")
    .select("id, agent, action, category, risk_level, decision, detail, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[workforce/autonomy] listAudit", error.message);
    return [];
  }
  return (data as AutonomyAuditRow[] | null) ?? [];
}
