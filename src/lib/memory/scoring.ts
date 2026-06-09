import type { MemoryKind } from "@/lib/memory/types";

/**
 * Importance scoring (1 low … 5 high). Deterministic + pure so it's testable
 * and predictable. Decisions and detected patterns matter most; routine
 * activity matters least. Callers may override with an explicit importance.
 */
const IMPORTANCE_BY_KIND: Record<MemoryKind, number> = {
  decision: 5,
  pattern: 5,
  preference: 4,
  approval: 4,
  workflow_outcome: 4,
  task: 3,
  conversation: 2,
  department_activity: 2,
};

export function scoreImportance(kind: MemoryKind): number {
  return IMPORTANCE_BY_KIND[kind] ?? 3;
}

/** Clamp any number into the valid 1..5 importance range. */
export function clampImportance(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}
