import "server-only";

import { createHash } from "node:crypto";
import { recordJuliusEntry, type JuliusEntry, type JuliusKind } from "@/lib/julius/service";
import {
  createJuliusInteractionContext,
  assertCompanyScope,
  type JuliusInteractionContext,
} from "@/lib/julius/interaction-context";
import { enforceJuliusWritePermission } from "@/lib/julius/permissions";

export type JuliusOutcomeCategory =
  | "engineering_completion"
  | "engineering_decision"
  | "failure_lesson"
  | "rollback_lesson"
  | "recovery_lesson"
  | "founder_clarification"
  | "approved_blocker";

export type JuliusVerificationState = "verified" | "unverified";

export interface JuliusPolicyState {
  approved: boolean;
  requiresApproval?: boolean;
  approvalId?: string | null;
}

export interface JuliusWorkerOutcome {
  status: "completed" | "failed" | "blocked";
  summary: string;
  details?: string | null;
}

export interface JuliusWritebackInput {
  context: Omit<JuliusInteractionContext, "timestamp"> & { timestamp?: string };
  category: JuliusOutcomeCategory;
  verification: JuliusVerificationState;
  policy: JuliusPolicyState;
  outcome: JuliusWorkerOutcome;
  source: {
    source_type: JuliusInteractionContext["source_type"];
    source_id: string;
  };
  trace?: Record<string, unknown>;
  hasExecutableRuntime?: boolean;
}

export interface JuliusWriteTrace {
  company_id: string;
  execution_id: string;
  correlation_id: string;
  causation_id: string | null;
  worker_id: string;
  source_type: JuliusInteractionContext["source_type"];
  source_id: string;
  category: JuliusOutcomeCategory;
  policy: {
    approved: boolean;
    requiresApproval: boolean;
    approvalId: string | null;
  };
  result: "written" | "deduplicated" | "rejected" | "failed";
  reason?: string;
}

export type JuliusWritebackResult =
  | {
      status: "written";
      writeId: string;
      entry: JuliusEntry;
      deduplicated: false;
      trace: JuliusWriteTrace;
      error?: undefined;
    }
  | {
      status: "deduplicated";
      writeId: string;
      entry: JuliusEntry;
      deduplicated: true;
      trace: JuliusWriteTrace;
      error?: undefined;
    }
  | {
      status: "rejected";
      writeId: string;
      deduplicated: false;
      reason: string;
      trace: JuliusWriteTrace;
      error?: undefined;
    }
  | {
      status: "failed";
      writeId: string;
      deduplicated: false;
      trace: JuliusWriteTrace;
      error: string;
    };

const CATEGORY_KIND: Record<JuliusOutcomeCategory, JuliusKind> = {
  engineering_completion: "activity",
  engineering_decision: "decision",
  failure_lesson: "knowledge",
  rollback_lesson: "historical",
  recovery_lesson: "knowledge",
  founder_clarification: "context",
  approved_blocker: "historical",
};

const CATEGORY_TITLES: Record<JuliusOutcomeCategory, string> = {
  engineering_completion: "Engineering completion",
  engineering_decision: "Engineering decision",
  failure_lesson: "Failure lesson",
  rollback_lesson: "Rollback lesson",
  recovery_lesson: "Recovery lesson",
  founder_clarification: "Founder clarification",
  approved_blocker: "Approved blocker",
};

const IN_MEMORY_DEDUPE = new Map<string, string>();

function buildWriteIdentity(input: {
  companyId: string;
  executionId: string;
  workerId: string;
  sourceType: string;
  sourceId: string;
  category: JuliusOutcomeCategory;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        companyId: input.companyId,
        executionId: input.executionId,
        workerId: input.workerId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        category: input.category,
      }),
    )
    .digest("hex");
}

function canonicalPayloadString(input: JuliusWritebackInput): string {
  return JSON.stringify({
    status: input.outcome.status,
    summary: input.outcome.summary,
    details: input.outcome.details ?? null,
    verification: input.verification,
    policy: {
      approved: input.policy.approved,
      requiresApproval: input.policy.requiresApproval ?? false,
      approvalId: input.policy.approvalId ?? null,
    },
    trace: input.trace ?? {},
  });
}

function buildTrace(input: {
  context: JuliusInteractionContext;
  source: JuliusWritebackInput["source"];
  category: JuliusOutcomeCategory;
  policy: JuliusPolicyState;
  result: JuliusWriteTrace["result"];
  reason?: string;
}): JuliusWriteTrace {
  return {
    company_id: input.context.company_id,
    execution_id: input.context.execution_id,
    correlation_id: input.context.correlation_id,
    causation_id: input.context.causation_id ?? null,
    worker_id: input.context.worker_id,
    source_type: input.source.source_type,
    source_id: input.source.source_id,
    category: input.category,
    policy: {
      approved: input.policy.approved,
      requiresApproval: input.policy.requiresApproval ?? false,
      approvalId: input.policy.approvalId ?? null,
    },
    result: input.result,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

export function clearJuliusWritebackDedupeForTests(): void {
  IN_MEMORY_DEDUPE.clear();
}

export async function writeVerifiedJuliusOutcome(input: JuliusWritebackInput): Promise<JuliusWritebackResult> {
  const context = createJuliusInteractionContext({
    ...input.context,
    source_type: input.source.source_type,
    source_id: input.source.source_id,
  });
  assertCompanyScope(context, context.company_id);

  const writeId = buildWriteIdentity({
    companyId: context.company_id,
    executionId: context.execution_id,
    workerId: context.worker_id,
    sourceType: input.source.source_type,
    sourceId: input.source.source_id,
    category: input.category,
  });

  if (!input.source.source_id?.trim()) {
    return {
      status: "rejected",
      writeId,
      deduplicated: false,
      reason: "missing_source_id",
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "rejected",
        reason: "missing_source_id",
      }),
    };
  }

  if (input.verification !== "verified") {
    return {
      status: "rejected",
      writeId,
      deduplicated: false,
      reason: "unverified_outcome",
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "rejected",
        reason: "unverified_outcome",
      }),
    };
  }

  if (input.outcome.status === "blocked" && input.category === "engineering_completion") {
    return {
      status: "rejected",
      writeId,
      deduplicated: false,
      reason: "blocked_not_completion",
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "rejected",
        reason: "blocked_not_completion",
      }),
    };
  }

  if (input.outcome.status === "blocked" && input.category === "engineering_decision") {
    return {
      status: "rejected",
      writeId,
      deduplicated: false,
      reason: "blocked_not_decision",
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "rejected",
        reason: "blocked_not_decision",
      }),
    };
  }

  const permission = enforceJuliusWritePermission({
    workerId: context.worker_id,
    category: input.category,
    verified: input.verification === "verified",
    companyId: context.company_id,
    expectedCompanyId: context.company_id,
    policyApproved: input.policy.approved,
    hasExecutableRuntime: input.hasExecutableRuntime ?? true,
  });

  if (!permission.allowed) {
    return {
      status: "rejected",
      writeId,
      deduplicated: false,
      reason: permission.reason,
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "rejected",
        reason: permission.reason,
      }),
    };
  }

  const payloadHash = canonicalPayloadString(input);
  const prior = IN_MEMORY_DEDUPE.get(writeId);
  if (prior) {
    if (prior === payloadHash) {
      const writerUserId = context.user_id ?? context.actor_id;
      if (!writerUserId) {
        return {
          status: "rejected",
          writeId,
          deduplicated: false,
          reason: "missing_writer_identity",
          trace: buildTrace({
            context,
            source: input.source,
            category: input.category,
            policy: input.policy,
            result: "rejected",
            reason: "missing_writer_identity",
          }),
        };
      }

      const synthetic = await recordJuliusEntry({
        companyId: context.company_id,
        userId: writerUserId,
        agent: context.worker_id,
        kind: CATEGORY_KIND[input.category],
        title: `${CATEGORY_TITLES[input.category]} (deduplicated)`,
        content: `${input.outcome.summary}\n\n(Logical write: deduplicated replay)`,
        refs: {
          execution_id: context.execution_id,
          correlation_id: context.correlation_id,
          causation_id: context.causation_id ?? null,
          source_type: input.source.source_type,
          source_id: input.source.source_id,
          write_id: writeId,
          deduplicated: true,
          policy: {
            approved: input.policy.approved,
            requiresApproval: input.policy.requiresApproval ?? false,
            approvalId: input.policy.approvalId ?? null,
          },
          trace: input.trace ?? {},
        },
      });

      if (!synthetic) {
        return {
          status: "failed",
          writeId,
          deduplicated: false,
          trace: buildTrace({
            context,
            source: input.source,
            category: input.category,
            policy: input.policy,
            result: "failed",
            reason: "write_failed",
          }),
          error: "write_failed",
        };
      }

      return {
        status: "deduplicated",
        writeId,
        deduplicated: true,
        entry: synthetic,
        trace: buildTrace({
          context,
          source: input.source,
          category: input.category,
          policy: input.policy,
          result: "deduplicated",
        }),
      };
    }

    return {
      status: "rejected",
      writeId,
      deduplicated: false,
      reason: "conflicting_duplicate_payload",
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "rejected",
        reason: "conflicting_duplicate_payload",
      }),
    };
  }

  IN_MEMORY_DEDUPE.set(writeId, payloadHash);

  try {
    const writerUserId = context.user_id ?? context.actor_id;
    if (!writerUserId) {
      return {
        status: "rejected",
        writeId,
        deduplicated: false,
        reason: "missing_writer_identity",
        trace: buildTrace({
          context,
          source: input.source,
          category: input.category,
          policy: input.policy,
          result: "rejected",
          reason: "missing_writer_identity",
        }),
      };
    }

    const entry = await recordJuliusEntry({
      companyId: context.company_id,
      userId: writerUserId,
      agent: context.worker_id,
      kind: CATEGORY_KIND[input.category],
      title: CATEGORY_TITLES[input.category],
      content: `${input.outcome.summary}${input.outcome.details ? `\n\n${input.outcome.details}` : ""}`,
      refs: {
        execution_id: context.execution_id,
        correlation_id: context.correlation_id,
        causation_id: context.causation_id ?? null,
        source_type: input.source.source_type,
        source_id: input.source.source_id,
        write_id: writeId,
        policy: {
          approved: input.policy.approved,
          requiresApproval: input.policy.requiresApproval ?? false,
          approvalId: input.policy.approvalId ?? null,
        },
        trace: input.trace ?? {},
      },
    });

    if (!entry) {
      return {
        status: "failed",
        writeId,
        deduplicated: false,
        trace: buildTrace({
          context,
          source: input.source,
          category: input.category,
          policy: input.policy,
          result: "failed",
          reason: "write_failed",
        }),
        error: "write_failed",
      };
    }

    return {
      status: "written",
      writeId,
      deduplicated: false,
      entry,
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "written",
      }),
    };
  } catch (error) {
    return {
      status: "failed",
      writeId,
      deduplicated: false,
      trace: buildTrace({
        context,
        source: input.source,
        category: input.category,
        policy: input.policy,
        result: "failed",
        reason: "write_failed",
      }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
