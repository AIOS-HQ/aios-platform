/**
 * AIOS autonomy tiers — default postures applied per agent via a one-click
 * preset. Pure data (client-safe). Applying a tier never enables global
 * autonomy on its own (the founder still flips the global master switch), and
 * never opens a restricted category. Safe-by-default.
 */

export type AutonomyTier = 1 | 2 | 3;

/** Agent → tier. Unknown agents default to the most conservative tier (3). */
export const AGENT_TIER: Record<string, AutonomyTier> = {
  harmony: 1,
  catalyst: 1,
  atlas: 1,
  pulse: 1,
  horizon: 1,
  ambassador: 2,
  auditor: 2,
  aegis: 3,
  ledger: 3,
};

export function tierOf(agent: string): AutonomyTier {
  return AGENT_TIER[agent] ?? 3;
}

export interface TierPreset {
  mode: "off" | "advisory" | "bounded";
  threshold: "none" | "low" | "medium";
  daily: number;
  monthly: number;
}

/**
 * Tier 1 — safe operational/knowledge/monitoring agents: bounded + real
 * autonomous execution within generous budgets.
 * Tier 2 — comms/audit: bounded but tighter limits + notify on medium.
 * Tier 3 — security/finance: advisory/approval-first (their work is restricted
 * by category anyway, so this is explicit, not just emergent).
 */
export const TIER_PRESETS: Record<AutonomyTier, TierPreset> = {
  1: { mode: "bounded", threshold: "medium", daily: 25, monthly: 500 },
  2: { mode: "bounded", threshold: "low", daily: 8, monthly: 120 },
  3: { mode: "advisory", threshold: "none", daily: 0, monthly: 0 },
};

/** Safe categories opened (globally) when tier defaults are applied. */
export const SAFE_OPEN_CATEGORIES = ["operational", "research", "communications"] as const;
