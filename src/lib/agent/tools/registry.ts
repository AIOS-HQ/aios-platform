import "server-only";

import { getRelevantMemories, recordMemory } from "@/lib/memory/service";
import { isMemoryKind } from "@/lib/memory/types";
import type { ToolDefinition } from "@/lib/agent/tools/types";

/**
 * Registry of tools Harmony can execute. Each tool is owner-scoped and declares
 * whether it needs human approval. This starts intentionally small + safe: the
 * only built-ins read/write the current user's OWN memory, so nothing here can
 * touch external systems or other users. Higher-risk tools (publishing content,
 * scheduling, external API calls) are added in later PRs and should set
 * `requiresApproval: true` so they route through the approval gate.
 */

const remember: ToolDefinition = {
  name: "remember",
  description:
    "Save a memory for the current user so Harmony can recall it later.",
  requiresApproval: false,
  run: async (ctx, params) => {
    const kindRaw = typeof params.kind === "string" ? params.kind : "preference";
    const kind = isMemoryKind(kindRaw) ? kindRaw : "preference";
    const content =
      typeof params.content === "string" ? params.content.trim() : "";
    if (!content) return { ok: false, message: "empty_content" };
    const source = typeof params.source === "string" ? params.source : "harmony";
    const saved = await recordMemory({ userId: ctx.userId, kind, content, source });
    return saved
      ? { ok: true, data: { id: saved.id } }
      : { ok: false, message: "save_failed" };
  },
};

const recall: ToolDefinition = {
  name: "recall",
  description:
    "Retrieve the current user's most relevant memories, optionally filtered by a keyword.",
  requiresApproval: false,
  run: async (ctx, params) => {
    const query = typeof params.query === "string" ? params.query : undefined;
    const limit =
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.min(50, Math.max(1, Math.round(params.limit)))
        : 8;
    const items = await getRelevantMemories(ctx.userId, query, limit);
    return {
      ok: true,
      data: {
        count: items.length,
        items: items.map((m) => ({
          id: m.id,
          kind: m.kind,
          content: m.content,
          importance: m.importance,
        })),
      },
    };
  },
};

const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  [remember.name]: remember,
  [recall.name]: recall,
};

export function getTool(name: string): ToolDefinition | null {
  return TOOL_REGISTRY[name] ?? null;
}

export function listToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY);
}

export function listToolNames(): string[] {
  return Object.keys(TOOL_REGISTRY);
}
