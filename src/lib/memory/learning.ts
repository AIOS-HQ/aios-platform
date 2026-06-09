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

export interface LearningSettings {
  enabled: boolean;
  requireApproval: boolean;
}

const DEFAULT_SETTINGS: LearningSettings = { enabled: true, requireApproval: false };

export async function getLearningSettings(userId: string): Promise<LearningSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("learning_settings")
    .select("enabled,require_approval")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Table/column may not exist yet (migration not applied) — safe defaults.
    console.error("[learning] getLearningSettings", error.message);
    return DEFAULT_SETTINGS;
  }
  if (!data) return DEFAULT_SETTINGS;
  const row = data as { enabled?: boolean; require_approval?: boolean };
  return {
    enabled: row.enabled ?? true,
    requireApproval: Boolean(row.require_approval),
  };
}

export async function isLearningEnabled(userId: string): Promise<boolean> {
  return (await getLearningSettings(userId)).enabled;
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

export async function setLearningApproval(
  userId: string,
  requireApproval: boolean,
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("learning_settings")
    .upsert(
      {
        user_id: userId,
        require_approval: requireApproval,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[learning] setLearningApproval", error.message);
    return false;
  }
  return true;
}

export interface LearnOptions {
  /** Record directly even when require-approval is on (for low-risk meta signals). */
  bypassApproval?: boolean;
}

/**
 * Gated auto-capture. Records a memory only when learning is enabled. When the
 * owner requires approval for new memories, the capture is instead queued as a
 * pending action (tool "remember") in agent_actions for review on
 * /settings/activity — unless bypassApproval is set. Never throws.
 */
export async function learnMemory(
  input: RecordMemoryInput,
  options: LearnOptions = {},
): Promise<void> {
  try {
    const settings = await getLearningSettings(input.userId);
    if (!settings.enabled) return;

    if (settings.requireApproval && !options.bypassApproval) {
      const supabase = await createClient();
      await supabase.from("agent_actions").insert({
        user_id: input.userId,
        tool: "remember",
        params: {
          kind: input.kind,
          content: input.content,
          source: input.source ?? "learning",
        },
        status: "pending",
        requires_approval: true,
        source: "learning",
      });
      return;
    }

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
