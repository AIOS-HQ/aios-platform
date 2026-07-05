/**
 * Universal Clarification Engine (Phase 2.1 · Foundation 2).
 *
 * The contract every AI worker inherits — Harmony, Julius, Ledger, Mason,
 * Catalyst, Guardian, Sentinel, Oracle, and every future worker: assess whether
 * required inputs are present; if not, raise structured questions, collect
 * answers, feed them to Julius, and resume. Workers never guess when
 * clarification is appropriate.
 */
export * from "./types";
export * from "./engine";
export * from "./store";
export * from "./supabase-store";

import { assessSufficiency, createClarificationRequest } from "./engine";
import { getClarificationStore } from "./store";
import type { ClarificationRequest, RequiredInput } from "./types";

export type ClarificationOutcome =
  | { status: "proceed" }
  | { status: "needs_clarification"; request: ClarificationRequest };

/**
 * The universal entry point. Assess sufficiency; if inputs are missing, persist
 * a pending clarification request and tell the worker to pause. The worker
 * resumes once answers are applied — the same resumable-work-item pattern the
 * Execution Spine already uses, so no second control flow is introduced.
 */
export async function ensureSufficientOrAsk(args: {
  worker: string;
  userId: string;
  companyId?: string;
  workItemId?: string;
  required: RequiredInput[];
  context: Record<string, unknown>;
}): Promise<ClarificationOutcome> {
  const { sufficient, missing } = assessSufficiency(args.required, args.context);
  if (sufficient) return { status: "proceed" };

  const request = createClarificationRequest({
    worker: args.worker,
    userId: args.userId,
    companyId: args.companyId,
    workItemId: args.workItemId,
    missing,
  });
  await Promise.resolve(getClarificationStore().create(request));
  return { status: "needs_clarification", request };
}
