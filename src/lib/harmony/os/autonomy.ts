/**
 * Department / agent autonomy model — AIOS Founder Harmony.
 *
 * Five levels with rising autonomy (and cost). The founder sets a per-department
 * level (and may override per agent); anything below "Operator" routes execution
 * through the Approval Center. Pure + dependency-free.
 */

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export const AUTONOMY_LEVELS = [
  { level: 0, key: "manual", cost: "" },
  { level: 1, key: "assistant", cost: "$" },
  { level: 2, key: "coordinator", cost: "$$" },
  { level: 3, key: "operator", cost: "$$$" },
  { level: 4, key: "executive", cost: "$$$$" },
] as const;

export type AutonomyKey = (typeof AUTONOMY_LEVELS)[number]["key"];

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

export function autonomyCost(level: AutonomyLevel): string {
  return AUTONOMY_LEVELS[level].cost;
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
