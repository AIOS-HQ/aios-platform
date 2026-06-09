/**
 * Harmony Memory Engine types (PR 1).
 * Mirrors the `public.memories` table (migration 20260604000000).
 */

export const MEMORY_KINDS = [
  "preference",
  "task",
  "approval",
  "decision",
  "conversation",
  "department_activity",
  "workflow_outcome",
  "pattern",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryRecord {
  id: string;
  user_id: string;
  kind: MemoryKind;
  content: string;
  source: string;
  source_id: string | null;
  importance: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function isMemoryKind(value: string | null | undefined): value is MemoryKind {
  return Boolean(value) && (MEMORY_KINDS as readonly string[]).includes(value as string);
}
