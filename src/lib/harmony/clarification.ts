import "server-only";

import {
  applyAnswers,
  assessSufficiency,
  createClarificationRequest,
  ensureSupabaseClarificationStore,
  getClarificationStore,
  type ClarificationRequest,
  type RequiredInput,
} from "@/lib/ai/clarification";
import type { OperatorResult } from "@/lib/ai/types";
import { juliusRemember, resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { createWorkItem } from "@/lib/workforce/work-queue";

/**
 * Harmony's adoption of the Universal Clarification Engine — the REFERENCE
 * implementation every future worker mirrors. The complete lifecycle:
 * detect ambiguity → ask structured questions (with WHY) → collect answers →
 * persist → update Julius → resume exactly where paused (re-enqueue the original
 * objective as a tracked work item) → explainability metadata. The user never
 * restarts work.
 *
 * Conservative trigger: gates only on inputs Harmony genuinely cannot proceed
 * without (today: the company an execution request targets), so it never blocks
 * a currently-working request.
 */

function clarificationToOperatorReply(request: ClarificationRequest): OperatorResult {
  const lines = request.questions.map((q, i) => {
    const opts = q.options?.length ? ` (${q.options.map((o) => o.label).join(" / ")})` : "";
    return `${i + 1}. ${q.prompt}${opts}\n   Why: ${q.whyItMatters}`;
  });
  return {
    intent: "general",
    reply: [
      "Before I act, I need a bit more information so I don't guess:",
      ...lines,
      "",
      "Share these and I'll continue right where we left off.",
    ].join("\n"),
  };
}

/**
 * Clarification gate for an execution request. Returns a questions reply when a
 * required input is missing, or null to proceed. The pending request is
 * persisted (resumable) with explainability metadata.
 */
export async function harmonyClarifyExecution(args: {
  userId: string;
  companyId: string | null;
  objective: string;
}): Promise<OperatorResult | null> {
  ensureSupabaseClarificationStore();

  const required: RequiredInput[] = [
    { key: "companyId", description: "the company this work is for", entity: true },
  ];
  const { sufficient, missing } = assessSufficiency(required, {
    companyId: args.companyId ?? undefined,
  });
  if (sufficient) return null;

  const request = createClarificationRequest({
    worker: "harmony",
    userId: args.userId,
    companyId: args.companyId ?? undefined,
    missing,
  });
  request.resumePayload = { kind: "execution_request", objective: args.objective };
  request.explainability = {
    missingInputs: missing.map((m) => m.key),
    rationale: "Harmony needs a target company before delegating business execution.",
  };
  await getClarificationStore().create(request);
  return clarificationToOperatorReply(request);
}

/**
 * If a Harmony clarification is pending for this user, treat the incoming
 * message as the answer: persist it, update Julius, and resume the paused
 * objective as a tracked work item. Returns the reply, or null when nothing is
 * pending (so normal routing proceeds).
 */
export async function consumePendingHarmonyClarification(
  userId: string,
  answerText: string,
): Promise<OperatorResult | null> {
  ensureSupabaseClarificationStore();

  const pending = (await getClarificationStore().listPending(userId)).find(
    (r) => r.worker === "harmony",
  );
  if (!pending) return null;

  const answers: Record<string, string | string[]> = {};
  for (const q of pending.questions) answers[q.id] = answerText;
  const { request: resolved, facts } = applyAnswers(pending, answers);
  resolved.explainability = {
    ...(pending.explainability ?? {}),
    resolvedAt: resolved.resolvedAt,
  };

  const objective =
    typeof pending.resumePayload?.objective === "string" ? pending.resumePayload.objective : "";
  const companyId = await resolvePrimaryCompanyId();

  if (!companyId) {
    // Still insufficient — keep the pause open, never lose the objective.
    await getClarificationStore().update({ ...pending, answers, explainability: resolved.explainability });
    return {
      intent: "general",
      reply:
        "Thanks. I still need a company set up before I can run that. Create your company, then reply and I'll continue automatically.",
    };
  }

  await getClarificationStore().update(resolved);

  await juliusRemember({
    userId,
    companyId,
    agent: "harmony",
    kind: "knowledge",
    title: "Clarification resolved",
    content: `Objective: ${objective}\nAnswers: ${JSON.stringify(facts)}`,
    refs: { clarificationId: resolved.id },
  }).catch(() => false);

  if (objective) {
    const item = await createWorkItem({
      userId,
      companyId,
      agent: "harmony",
      title: objective,
      detail: `${objective}\n\nResumed after clarification. Answers: ${JSON.stringify(facts)}`,
      kind: "task",
    });
    if (item) {
      await getClarificationStore().update({ ...resolved, workItemId: item.id });
      return {
        intent: "execution_request",
        reply: `Got it — resuming "${objective}". I've queued it as work item ${item.id} with your answers, so nothing was lost.`,
        actionTaken: { type: "work_delegated", label: item.id },
      };
    }
  }

  return { intent: "general", reply: "Thanks — I've recorded that and can continue now." };
}
