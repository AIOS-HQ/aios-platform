import "server-only";

import { executeMasonRuntimePlan, type MasonRuntimeExecutorAdapters } from "@/lib/harmony/code/mason-runtime-executor";
import type { MasonLiveExecutionPlanInput } from "@/lib/harmony/code/mason-live-execution";
import { runConnectorCapability } from "@/lib/integrations/connector-runtime";
import { determineMasonExecutionReadiness } from "@/lib/harmony/autonomy/mason-integration";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";
import { getConnections } from "@/lib/integrations/connections";
import { emitActivity } from "@/lib/harmony/os/events";
import { appendMasonLedgerEvent } from "@/lib/harmony/code/mason-ledger";
import { getCanonicalVercelDeploymentStatus } from "@/lib/integrations/clients/vercel";
import { assertMasonExecutionIdentity, type MasonExecutionIdentity } from "@/lib/harmony/code/mason-execution-identity";
import type { MasonEngineeringTaskContract } from "@/lib/harmony/code/mason-engineering-task";

export interface MasonProductionRuntimeInput extends MasonLiveExecutionPlanInput {
  userId: string;
  companyId?: string | null;
  executionIdentity: MasonExecutionIdentity;
  taskContract: MasonEngineeringTaskContract;
}

export interface MasonProductionRuntimeResult {
  status: "completed" | "blocked" | "failed";
  summary: string;
  pullRequestUrl: string | null;
  previewUrl: string | null;
  executionId: string;
  branch: string | null;
  commitSha: string | null;
  pullRequestNumber: number | null;
  validationMode: "external_ci";
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
  const vercelDeployment = await getCanonicalVercelDeploymentStatus(userId, {
    repo: process.env.HARMONY_DEFAULT_GITHUB_REPO ?? process.env.GITHUB_DEFAULT_REPO ?? "AIOS-HQ/aios-platform",
    environment: "production",
    requestedGitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_GIT_SHA ??
      null,
    canonicalDomain:
      process.env.VERCEL_PROJECT_PRODUCTION_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      null,
  });
  return {
    github: github
      ? connected.has("github") &&
        isConnectorConfigured(github) &&
        ["create_branch", "commit_file_to_branch", "open_pull_request", "create_issue"].every((capability) =>
          githubCapabilities.has(capability),
        )
      : false,
    vercel:
      Boolean(vercel) &&
      vercelCapabilities.has("deployment_status") &&
      vercelDeployment.status === "healthy",
    vercelStatus: vercelDeployment.status,
    vercelEvidenceTier: vercelDeployment.evidenceTier,
    vercelEvidenceSources: vercelDeployment.evidenceSources,
    vercelGitShaMatches: vercelDeployment.gitShaMatches,
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
          refId: args.executionId ?? input.executionIdentity.executionId,
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
          refId: String(payload.executionId ?? input.executionIdentity.executionId),
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
          refId: String(payload.executionId ?? input.executionIdentity.executionId),
        });
        return { recorded: true };
      },
      async updateReviewQueue(payload) {
        return {
          queued: false,
          source: "approval_payloads",
          detail: "review_queue_is_written_only_by_governance_policy",
          executionId: input.executionIdentity.executionId,
          summary: String(payload.summary ?? "Mason runtime review state"),
        };
      },
      async updateJuliusMemory() {
        return { remembered: false, detail: "julius_write_deferred_to_closed_loop" };
      },
      async updateCompanySkills() {
        return { learned: false, detail: "company_skill_write_deferred_to_closed_loop" };
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
  const companyId = input.companyId ?? "no-company";
  assertMasonExecutionIdentity(input.executionIdentity, { userId: input.userId, companyId });
  if (input.taskContract.executionIdentity.executionId !== input.executionIdentity.executionId) {
    throw new Error("mason_task_execution_identity_mismatch");
  }
  const executionId = input.executionIdentity.executionId;

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
    { taskContract: input.taskContract },
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
      executionId,
      branch: null,
      commitSha: null,
      pullRequestNumber: null,
      validationMode: "external_ci",
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
      executionId,
      branch: null,
      commitSha: null,
      pullRequestNumber: null,
      validationMode: "external_ci",
    };
  }

  const health = await masonRuntimeHealth(input.userId);
  if (!health.github || !health.harmony) {
    await appendMasonLedgerEvent({
      executionId,
      userId: input.userId,
      companyId: input.companyId ?? "no-company",
      eventType: "execution_failed",
      runtimeState: "blocked",
      operationType: "runtime_health",
      resultStatus: "failed",
      failureClassification: "connector_failure",
      summary: `Mason runtime blocked. GitHub=${health.github}, Vercel=${health.vercelStatus} (${health.vercelEvidenceTier}), Harmony=${health.harmony}.`,
      metadata: health,
      idempotencyKey: `${executionId}:execution_failed_health`,
    });
    return {
      status: "blocked",
      summary: `Mason runtime blocked. GitHub=${health.github}, Vercel=${health.vercelStatus} (${health.vercelEvidenceTier}), Harmony=${health.harmony}.`,
      pullRequestUrl: null,
      previewUrl: null,
      executionId,
      branch: null,
      commitSha: null,
      pullRequestNumber: null,
      validationMode: "external_ci",
    };
  }

  // The engine authorized execution (founder approval or directive) — run the
  // plan as Founder-approved for the execution-bridge boundary.
  const authorizedInput: MasonProductionRuntimeInput = input.founderApproved
    ? input
    : { ...input, founderApproved: true };
  const result = await executeMasonRuntimePlan(authorizedInput, adapters, {
    executionIdentity: input.executionIdentity,
    recordLifecycle: false,
  });
  return {
    status: result.status,
    summary: result.summary,
    pullRequestUrl: noRequestLabel(result.pullRequestUrl, result.summary, "PR"),
    previewUrl: noRequestLabel(result.previewUrl, result.summary, "Preview"),
    executionId,
    branch: result.branch,
    commitSha: result.commitSha,
    pullRequestNumber: result.pullRequestNumber,
    validationMode: "external_ci",
  };
}
