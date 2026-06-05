/**
 * Department / agent autonomy model — AIOS Founder Harmony.
 *
 * Five levels with rising autonomy (and cost):
 *   0 Manual · 1 Assistant ($) · 2 Coordinator ($$) · 3 Operator ($$$) ·
 *   4 Executive Autonomous ($$$$)
 *
 * The founder sets a per-department level (and may override per agent); anything
 * below "Operator" (level 3) routes execution through the Approval Center. The
 * `costTier` is a display hint (rising spend as helpers act more autonomously
 * against paid AI providers); the human-readable label lives in i18n under
 * `os.autonomy.<key>`. Pure + dependency-free.
 */

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

/** Rising spend indicator shown alongside each level ("" → "$$$$"). */
export type AutonomyCostTier = "" | "$" | "$$" | "$$$" | "$$$$";

export const AUTONOMY_LEVELS = [
  { level: 0, key: "manual", costTier: "" },
  { level: 1, key: "assisted", costTier: "$" },
  { level: 2, key: "supervised", costTier: "$$" },
  { level: 3, key: "autonomous", costTier: "$$$" },
  { level: 4, key: "executive", costTier: "$$$$" },
] as const;

export type AutonomyKey = (typeof AUTONOMY_LEVELS)[number]["key"];

/** Spend indicator for a level (rises with autonomy). */
export function autonomyCostTier(level: AutonomyLevel): AutonomyCostTier {
  return AUTONOMY_LEVELS[level].costTier;
}

export function isAutonomyLevel(n: unknown): n is AutonomyLevel {
  return n === 0 || n === 1 || n === 2 || n === 3 || n === 4;
}

/** Coerce arbitrary numeric input into a valid level (0–4). */
export function clampAutonomy(n: number): AutonomyLevel {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 4) return 4;
  return Math.round(n) as AutonomyLevel;
}

export function autonomyKey(level: AutonomyLevel): AutonomyKey {
  return AUTONOMY_LEVELS[level].key;
}

/**
 * Effective autonomy: an agent's explicit level overrides its department's;
 * otherwise it inherits the department level.
 */
export function resolveAutonomy(
  departmentLevel: AutonomyLevel,
  agentLevel?: AutonomyLevel | null,
): AutonomyLevel {
  return agentLevel ?? departmentLevel;
}

/**
 * Whether an action at the given effective autonomy must pause for founder
 * approval. Manual / Assistant / Coordinator (0–2) always route through the
 * Approval Center; Operator (3) and Executive (4) act directly — but any
 * high-risk action requires approval regardless of level.
 */
export function requiresApproval(
  level: AutonomyLevel,
  opts?: { highRisk?: boolean },
): boolean {
  if (opts?.highRisk) return true;
  return level < 3;
}
