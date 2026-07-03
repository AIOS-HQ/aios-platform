/**
 * Unified Autonomy Policy Engine — Autonomy levels (0-4).
 *
 * Defines the 5-level autonomy model that represents agent authority.
 * Combines with action risk class to determine whether execution is allowed.
 *
 * Pure, dependency-free utility functions.
 */

import type { AutonomyLevel } from "./types";

/**
 * The 5 autonomy levels.
 *
 * Level < 3 (Manual, Assisted, Supervised): approval-gated by default.
 * Level >= 3 (Autonomous, Executive): can execute autonomously (but high-risk actions still need approval).
 */
export const AUTONOMY_LEVELS = [
  { level: 0, key: "manual", costTier: "$", description: "All actions require founder approval" },
  { level: 1, key: "assisted", costTier: "$$", description: "Agent suggests; founder decides" },
  { level: 2, key: "supervised", costTier: "$$$", description: "Routine actions auto-execute; risky actions need approval" },
  { level: 3, key: "autonomous", costTier: "$$$$", description: "Most actions auto-execute; destructive actions need approval" },
  { level: 4, key: "executive", costTier: "$$$$$", description: "Autonomous execution with minimal oversight" },
] as const;

export function isAutonomyLevel(n: unknown): n is AutonomyLevel {
  return n === 0 || n === 1 || n === 2 || n === 3 || n === 4;
}

export function clampAutonomy(n: number): AutonomyLevel {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 4) return 4;
  return Math.round(n) as AutonomyLevel;
}

export function autonomyLevelName(level: AutonomyLevel): string {
  return AUTONOMY_LEVELS[level].key.toUpperCase();
}

export function autonomyLevelDescription(level: AutonomyLevel): string {
  return AUTONOMY_LEVELS[level].description;
}

/**
 * Whether an agent at this autonomy level can execute routine actions
 * without founder approval.
 *
 * Manual (0), Assisted (1), Supervised (2): no
 * Autonomous (3), Executive (4): yes (unless action has a Founder directive that denies it)
 */
export function canExecuteRoutineAtLevel(level: AutonomyLevel): boolean {
  return level >= 2; // Supervised (2) and above can execute routine actions
}

/**
 * Whether an agent at this autonomy level can execute approval-level actions
 * without founder approval.
 *
 * Only Executive (4) can.
 */
export function canExecuteApprovalActionsAtLevel(level: AutonomyLevel): boolean {
  return level >= 4;
}

/**
 * All actions require founder approval at any autonomy level if they are destructive.
 * This is a safety boundary that cannot be overridden by autonomy level alone.
 */
export function canBypassApprovalForDestructive(_level: AutonomyLevel): boolean {
  return false; // Always false: destructive actions always need approval
}

/**
 * Effective autonomy: agent override wins; otherwise use department level.
 */
export function resolveAutonomy(
  departmentLevel: AutonomyLevel,
  agentLevel?: AutonomyLevel | null,
): AutonomyLevel {
  return agentLevel !== undefined && agentLevel !== null ? agentLevel : departmentLevel;
}
