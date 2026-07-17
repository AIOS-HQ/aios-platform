import "server-only";

import { executeMasonRuntimePlan, type MasonRuntimeExecutorAdapters } from "@/lib/harmony/code/mason-runtime-executor";
import type { MasonLiveExecutionPlanInput } from "@/lib/harmony/code/mason-live-execution";
import { runConnectorCapability } from "@/lib/integrations/connector-runtime";
import { determineMasonExecutionReadiness } from "@/lib/harmony/autonomy/mason-integration";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";
import { getConnections } from "@/lib/integrations/connections";
import { emitActivity } from "@/lib/harmony/os/events";
import { juliusRemember } from "@/lib/julius/wiring";
import { learnCompanySkill } from "@/lib/company-skills/library";
import { appendMasonLedgerEvent, createMasonExecutionId } from "@/lib/harmony/code/mason-ledger";

export interface MasonProductionRuntimeInput extends MasonLiveExecutionPlanInput {
  userId: string;
  companyId?: string | null;
}

export interface MasonProductionRuntimeResult {
  status: "completed" | "blocked" | "failed";
  summary: string;
  pullRequestUrl: string | null;
  previewUrl: string | null;
}

async function runRequiredConnector(
  userId: string,
  connectorId: string,
  capabilityId: string,
  params: Record<string, unknown>,
) {
  const result = await runConnectorCapability(userId, connectorId, capabilityId, params, { approved: true });
  if (!result.ok) throw new Error(`${connectorId}.${capabilityId}: ${result.message}`);
  return result.data ?? { ok: true };
}

function noRequestLabel(value: string | null, summary: string, marker: "PR" | "Preview"): string | null {
  if (value) return value;
  return summary.includes(`${marker}: not requested`) ? "not requested" : null;
}

export async function masonRuntimeHealth(userId: string) {
  const connections = await getConnections(userId);
  const connected = new Set(connections.filter((item) => item.status === "connected").map((item) => item.provider));
  const github = getConnector("github");
  const vercel = getConnector("vercel");
  const githubCapabilities = new Set((github?.capabilities ?? []).map((cap) => cap.id));
  const vercelCapabilities = new Set((vercel?.capabilities ?? []).map((cap) => cap.id));
  return {
    github: github
      ? connected.has("github") &&
        isConnectorConfigured(github) &&
        ["create_branch", "commit_file_to_branch", "open_pull_request", "create_issue"].every((capability) =>
          githubCapabilities.has(capability),
        )
      : false,
    vercel: vercel
      ? isConnectorConfigured(vercel) && ["deployment_status"].every((capability) => vercelCapabilities.has(capability))
      : false,
    harmony: true,
  };
}

export function createMasonProductionAdapters(input: MasonProductionRuntimeInput): MasonRuntimeExecutorAdapters {
  return {
    github: {
      createBranch(args) {
        return runRequiredConnector(input.userId, "github", "create_branch", {
          repo: args.repository,
          branch: args.branch,
          base: args.base,
        });
      },
      commitFile(args) {
        return runRequiredConnector(input.userId, "github", "commit_file_to_branch", {
          repo: args.repository,
          branch: args.branch,
          path: args.path,
          content: args.content,
          message: args.message,
        });
      },
      openPullRequest(args) {
        return runRequiredConnector(input.userId, "github", "open_pull_request", {
          repo: args.repository,
          title: args.title,
          head: args.head,
          base: args.base,
          body: args.body,
        });
      },
      createIssue(args) {
        return runRequiredConnector(input.userId, "github", "create_issue", {
          repo: args.repository,
          repository: args.repository,
          title: args.title,
          body: args.body ?? null,
          labels: args.labels ?? [],
        });
      },
      closePullRequest(args) {
        return runRequiredConnector(input.userId, "github", "close_pull_request", {
          repo: args.repository,
          pr_number: args.prNumber,
          state: "closed",
        });
      },
    },
    vercel: {
      inspectPreview(args) {
        return runRequiredConnector(input.userId, "vercel", "deployment_status", {
          repo: args.repository,
          branch: args.branch,
          objective: args.objective,
          previewUrl: args.previewUrl ?? null,
        });
      },
    },
    harmony: {
      async requestValidation(args) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "agent_action",
          summary: `Mason requested validation for ${args.branch}: ${args.commands.join(", ")}`,
          refType: "mason_validation",
          refId: args.branch,
        });
        return { requested: true, commands: args.commands };
      },
      async reportOutcome(payload) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "agent_action",
          summary: String(payload.summary ?? "Mason runtime outcome"),
          refType: "mason_runtime",
          refId: String(payload.branch ?? "mason"),
        });
        return { reported: true };
      },
      async recordActivity(payload) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "agent_action",
          summary: String(payload.summary ?? "Mason runtime activity"),
          refType: "mason_runtime",
          refId: String(payload.branch ?? "mason"),
        });
        return { recorded: true };
      },
      async updateReviewQueue(payload) {
        await emitActivity({
          userId: input.userId,
          companyId: input.companyId ?? null,
          actorType: "agent",
          actorId: "mason",
          kind: "approval",
          summary: String(payload.summary ?? "Mason runtime awaiting Founder review"),
          refType: "mason_review_queue",
          refId: String(payload.branch ?? "mason"),
        });
        return { queued: true };
      },
      async updateJuliusMemory(payload) {
        if (input.companyId) {
          await juliusRemember({
            userId: input.userId,
            companyId: input.companyId,
            agent: "mason",
            kind: "activity",
            title: "Mason runtime execution",
            content: String(payload.summary ?? "Mason runtime memory"),
            refs: { source: "mason_runtime", payload },
            importance: 4,
          });
        }
        return { remembered: Boolean(input.companyId) };
      },
      async updateCompanySkills(payload) {
        await learnCompanySkill({
          userId: input.userId,
          companyId: input.companyId ?? null,
          ownerAgent: "mason",
          title: "Mason runtime execution",
          summary: String(payload.summary ?? "Reusable Mason execution pattern"),
          outcome: String(payload.summary ?? "Mason completed runtime reporting"),
          category: "engineering",
          success: true,
          source: "manual",
          sourceId: String(payload.branch ?? "mason"),
        });
        return { learned: Boolean(input.companyId) };
      },
    },
  };
}

/**
 * Default Mason autonomy level for the policy-engine gate. Level 0 keeps Mason
 * Founder-gated by default (every action pauses for approval) while still
 * honoring explicit Founder directives that authorize specific actions. An
 * explicit founderApproved input (e.g. from execution-resumption) short-circuits
 * the engine to execute.
 */
const MASON_DEFAULT_AUTONOMY_LEVEL = 0 as const;

export async function runMasonProductionRuntime(
  input: MasonProductionRuntimeInput,
  adapters: MasonRuntimeExecutorAdapters = createMasonProductionAdapters(input),
): Promise<MasonProductionRuntimeResult> {
  const executionId = createMasonExecutionId({
    userId: input.userId,
    companyId: input.companyId ?? "no-company",
    repository: input.repository,
    objective: input.objective,
    branch: input.branchName ?? null,
  });

  await appendMasonLedgerEvent({
    executionId,
    userId: input.userId,
    companyId: input.companyId ?? "no-company",
    eventType: "intake_received",
    runtimeState: "ready",
    operationType: "mason_runtime_intake",
    resultStatus: "ok",
    summary: "Mason execution request received.",
    metadata: {
      repository: input.repository,
      objective: input.objective,
      requesterRole: input.requesterRole ?? "founder",
    },
    idempotencyKey: `${executionId}:intake_received`,
  });
  // Route the execute/pause decision through the Unified Autonomy Policy Engine.
  // Approval-required work persists a resumable approval_payload (surfaced in the
  // Review Queue) instead of silently blocking.
  const readiness = await determineMasonExecutionReadiness(
    input.userId,
    input.companyId ?? null,
    input.objective,
    input.repository,
    MASON_DEFAULT_AUTONOMY_LEVEL,
    input.founderApproved,
  );
  await appendMasonLedgerEvent({
    executionId,
    userId: input.userId,
    companyId: input.companyId ?? "no-company",
    eventType: "policy_evaluated",
    runtimeState: readiness.ready_now ? "ready" : readiness.is_blocked ? "blocked" : "awaiting_founder_approval",
    operationType: "autonomy_policy",
    resultStatus: readiness.ready_now ? "ok" : readiness.is_blocked ? "blocked" : "partial",
    failureClassification: readiness.is_blocked ? "policy_blocked" : null,
    summary: readiness.reason,
    metadata: {
      ready_to_execute: readiness.ready_to_execute,
      ready_now: readiness.ready_now,
      requires_approval: readiness.requires_approval,
      approval_id: readiness.approval_id ?? null,
    },
    idempotencyKey: `${executionId}:policy_evaluated`,
  });
  if (readiness.requires_approval) {
    await appendMasonLedgerEvent({
      executionId,
      userId: input.userId,
      companyId: input.companyId ?? "no-company",
      eventType: "approval_requested",
      runtimeState: "awaiting_founder_approval",
      approvalId: readiness.approval_id ?? null,
      operationType: "approval_gate",
      resultStatus: "blocked",
      summary: "Mason execution paused for founder approval.",
      metadata: { reason: readiness.reason },
      idempotencyKey: `${executionId}:approval_requested`,
    });
    return {
      status: "blocked",
      summary: `Awaiting Founder approval.${readiness.approval_id ? ` Approval ID: ${readiness.approval_id}.` : ""} ${readiness.reason}`,
      pullRequestUrl: null,
      previewUrl: null,
    };
  }
  if (readiness.is_blocked) {
    await appendMasonLedgerEvent({
      executionId,
      userId: input.userId,
      companyId: input.companyId ?? "no-company",
      eventType: "execution_failed",
      runtimeState: "blocked",
      operationType: "policy_gate",
      resultStatus: "blocked",
      failureClassification: "policy_blocked",
      summary: `Execution blocked: ${readiness.reason}`,
      metadata: {},
      idempotencyKey: `${executionId}:execution_failed_blocked`,
    });
    return {
      status: "blocked",
      summary: `Execution blocked: ${readiness.reason}`,
      pullRequestUrl: null,
      previewUrl: null,
    };
  }

  const health = await masonRuntimeHealth(input.userId);
  if (!health.github || !health.vercel || !health.harmony) {
    await appendMasonLedgerEvent({
      executionId,
      userId: input.userId,
      companyId: input.companyId ?? "no-company",
      eventType: "execution_failed",
      runtimeState: "blocked",
      operationType: "runtime_health",
      resultStatus: "failed",
      failureClassification: "connector_failure",
      summary: `Mason runtime blocked. GitHub=${health.github}, Vercel=${health.vercel}, Harmony=${health.harmony}.`,
      metadata: health,
      idempotencyKey: `${executionId}:execution_failed_health`,
    });
    return {
      status: "blocked",
      summary: `Mason runtime blocked. GitHub=${health.github}, Vercel=${health.vercel}, Harmony=${health.harmony}.`,
      pullRequestUrl: null,
      previewUrl: null,
    };
  }

  // The engine authorized execution (founder approval or directive) — run the
  // plan as Founder-approved for the execution-bridge boundary.
  const authorizedInput: MasonProductionRuntimeInput = input.founderApproved
    ? input
    : { ...input, founderApproved: true };
  const result = await executeMasonRuntimePlan(authorizedInput, adapters);
  await appendMasonLedgerEvent({
    executionId,
    userId: input.userId,
    companyId: input.companyId ?? "no-company",
    eventType:
      result.status === "completed"
        ? "execution_completed"
        : result.status === "blocked"
          ? "execution_cancelled"
          : "execution_failed",
    runtimeState:
      result.status === "completed"
        ? "completed"
        : result.rollback?.toState ?? "failed",
    operationType: "runtime_execution",
    resultStatus:
      result.status === "completed"
        ? "ok"
        : result.status === "blocked"
          ? "blocked"
          : "failed",
    failureClassification: result.status === "failed" ? "runtime_failure" : null,
    summary: result.summary,
    pullRequestUrl: result.pullRequestUrl,
    previewUrl: result.previewUrl,
    rollbackRef: result.rollback?.executionId ?? null,
    metadata: {
      rollback: result.rollback ?? null,
    },
    idempotencyKey: `${executionId}:execution_final`,
  });
  return {
    status: result.status,
    summary: result.summary,
    pullRequestUrl: noRequestLabel(result.pullRequestUrl, result.summary, "PR"),
    previewUrl: noRequestLabel(result.previewUrl, result.summary, "Preview"),
  };
}
