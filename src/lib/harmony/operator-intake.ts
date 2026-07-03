/**
 * Operator input intake — oversize handling (pure, dependency-injected).
 *
 * Root-cause fix for the Harmony chat input cap: a Founder instruction longer
 * than LIMITS.operatorInput must NOT fail silently or be refused. Instead the
 * full text is captured as a tracked work item and the Operator replies with the
 * work item id. Kept in its own dependency-light module (LIMITS + a type only)
 * so it is unit-testable without importing the heavy operator-actions runtime.
 */

import { LIMITS } from "@/lib/limits";
import type { OperatorResult } from "@/lib/ai/types";

/** True when the instruction exceeds the operator input cap. */
export function isOversizedOperatorInput(text: string): boolean {
  return (text ?? "").trim().length > LIMITS.operatorInput;
}

/** Derive a concise work-item title from a long instruction (first real line). */
export function deriveWorkTitle(text: string): string {
  const firstLine = (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const base = (firstLine ?? (text ?? "").trim()).slice(0, LIMITS.title).trim();
  return base || "Founder instruction";
}

export interface OversizedIntakeDeps {
  resolveCompanyId: () => Promise<string | null>;
  createWorkItem: (params: {
    userId: string;
    companyId: string | null;
    agent: string;
    title: string;
    detail: string;
    kind: "task";
  }) => Promise<{ id: string } | null>;
}

/**
 * Convert an over-limit Founder instruction into a tracked work item instead of
 * dropping it. Returns a human-visible OperatorResult with the work item id, or
 * an explicit failure reason — never a silent drop.
 */
export async function saveOversizedInstructionAsWork(
  userId: string,
  text: string,
  deps: OversizedIntakeDeps,
): Promise<OperatorResult> {
  const companyId = await deps.resolveCompanyId();
  const item = await deps.createWorkItem({
    userId,
    companyId,
    agent: "harmony",
    title: deriveWorkTitle(text),
    detail: text,
    kind: "task",
  });

  if (!item) {
    return {
      intent: "general",
      reply:
        "That instruction is long, so I tried to save the full text as a work item — but that failed just now. Nothing was dropped; please try again, or shorten it.",
    };
  }

  return {
    intent: "execution_request",
    reply: `That instruction is long, so I saved the full text as a work item (ID: ${item.id}) instead of dropping it. Track and run it from the Review Queue.`,
    actionTaken: { type: "work_delegated", label: item.id },
  };
}
