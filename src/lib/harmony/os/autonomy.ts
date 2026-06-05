/**
 * Department / agent autonomy model — AIOS Founder Harmony (L3.5).
 *
 * Pure, dependency-free logic shared by the data layer, server actions, and UI.
 * The founder sets a per-department autonomy level (and may override per agent);
 * everything below "autonomous" routes execution through the Approval Center.
 */

export type AutonomyLevel = 0 | 1 | 2 | 3;

export const AUTONOMY_LEVELS = [
  { level: 0, key: "manual" },
  { level: 1, key: "approval" },
  { level: 2, key: "assisted" },
  { level: 3, key: "autonomous" },
] as const;

export type AutonomyKey = (typeof AUTONOMY_LEVELS)[number]["key"];

export function isAutonomyLevel(n: unknown): n is AutonomyLevel {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

/** Coerce arbitrary numeric input into a valid level (0–3). */
export function clampAutonomy(n: number): AutonomyLevel {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 3) return 3;
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
 * approval. Only level 3 (autonomous) executes directly; high-risk actions
 * always require approval regardless of level.
 */
export function requiresApproval(
  level: AutonomyLevel,
  opts?: { highRisk?: boolean },
): boolean {
  if (opts?.highRisk) return true;
  return level < 3;
}
