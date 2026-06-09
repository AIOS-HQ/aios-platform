import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  listMemories,
  recordMemory,
  type RecordMemoryInput,
} from "@/lib/memory/service";
import type { MemoryKind } from "@/lib/memory/types";

/**
 * Harmony Auto-Learning (server-only).
 *
 * Adds adaptive capture + review on top of the existing Memory engine WITHOUT
 * changing it. `learnMemory` is the gated write hook: it records a memory only
 * when the owner has not disabled learning. Manual memory management is never
 * gated. The pattern summary is read-only and derives entirely from existing
 * memories. Everything is owner-scoped via RLS.
 */

export async function isLearningEnabled(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_settings")
    .select("enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Table may not exist yet (migration not applied) — default to enabled.
    console.error("[learning] isLearningEnabled", error.message);
    return true;
  }
  return data ? Boolean((data as { enabled: boolean }).enabled) : true;
}

export async function setLearningEnabled(
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("learning_settings")
    .upsert(
      { user_id: userId, enabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[learning] setLearningEnabled", error.message);
    return false;
  }
  return true;
}

/**
 * Gated auto-capture used by activity hooks. Records a memory only when learning
 * is enabled for the owner. Never throws — capture must not break the action it
 * is observing.
 */
export async function learnMemory(input: RecordMemoryInput): Promise<void> {
  try {
    if (!(await isLearningEnabled(input.userId))) return;
    await recordMemory({ ...input, source: input.source ?? "auto" });
  } catch (e) {
    console.error("[learning] learnMemory", e);
  }
}

// ---------------------------------------------------------------------------
// Categorisation + pattern summary (read-only; derives from existing memories).
// ---------------------------------------------------------------------------

export type LearningCategory = "preference" | "episodic" | "pattern";

/** Maps memory kinds onto the three learning categories. */
export const CATEGORY_KINDS: Record<LearningCategory, MemoryKind[]> = {
  preference: ["preference", "approval"],
  episodic: ["decision", "workflow_outcome", "task", "conversation"],
  pattern: ["pattern", "department_activity"],
};

export const LEARNING_CATEGORIES: LearningCategory[] = [
  "preference",
  "episodic",
  "pattern",
];

export interface LearningSummary {
  total: number;
  byCategory: Record<LearningCategory, number>;
  topKinds: { kind: MemoryKind; count: number }[];
  recentDecisions: { content: string; created_at: string }[];
}

/**
 * Read-only "what Harmony has learned" view — pattern detection over the user's
 * existing memories. Stores nothing; safe to call any time.
 */
export async function summarizeLearning(userId: string): Promise<LearningSummary> {
  const memories = await listMemories(userId, { limit: 500 });
  const byCategory: Record<LearningCategory, number> = {
    preference: 0,
    episodic: 0,
    pattern: 0,
  };
  const kindCounts = new Map<MemoryKind, number>();

  for (const m of memories) {
    const kind = m.kind as MemoryKind;
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    for (const cat of LEARNING_CATEGORIES) {
      if (CATEGORY_KINDS[cat].includes(kind)) byCategory[cat] += 1;
    }
  }

  const topKinds = [...kindCounts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const recentDecisions = memories
    .filter((m) => m.kind === "decision")
    .slice(0, 5)
    .map((m) => ({ content: m.content, created_at: m.created_at }));

  return { total: memories.length, byCategory, topKinds, recentDecisions };
}
