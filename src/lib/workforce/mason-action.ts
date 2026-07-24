"use server";

import { createMasonNativeRuntimePlan } from "@/lib/harmony/code/mason";
import {
  createMasonEngineeringTaskContract,
  type MasonRequestedOutcome,
  type MasonRequesterAuthorization,
} from "@/lib/harmony/code/mason-engineering-task";
import { createMasonExecutionIdentity } from "@/lib/harmony/code/mason-execution-identity";
import { appendMasonLedgerEvent, listMasonExecutionTimeline } from "@/lib/harmony/code/mason-ledger";
import {
  runMasonProductionRuntime,
  type MasonProductionRuntimeResult,
} from "@/lib/harmony/code/mason-production-runtime";
import type { MasonLiveFileChange } from "@/lib/harmony/code/mason-live-execution";
import { getCanonicalVercelDeploymentStatus } from "@/lib/integrations/clients/vercel";
import { runGithubRead } from "@/lib/integrations/clients/github";
import { retrieveMasonExecutionContext } from "@/lib/julius/mason-retrieval";
import { recordMasonEngineeringLearning } from "@/lib/workforce/mason-learning";
import {
  runMasonClosedLoopExecution,
  type MasonCiResult,
  type MasonClosedLoopAdapters,
  type MasonClosedLoopState,
} from "@/lib/workforce/mason-closed-loop";

function parseRepo(repo: string): { owner: string; name: string } | null {
  const normalized = repo.trim().replace(/^https?:\/\/github\.com\//i, "");
  const [owner, name] = normalized.split("/");
  return owner && name ? { owner, name } : null;
}

function normalizeCiRuns(data: Record<string, unknown> | undefined): Array<{ status: string; conclusion: string | null; headSha: string | null }> {
  const runs = Array.isArray((data as { runs?: unknown[] } | undefined)?.runs)
    ? ((data as { runs?: Array<Record<string, unknown>> }).runs ?? [])
    : [];
  return runs.map((run) => ({
    status: String(run.status ?? "unknown"),
    conclusion: run.conclusion == null ? null : String(run.conclusion),
    headSha: typeof run.head_sha === "string" ? run.head_sha : null,
  }));
}

function classifyCiEvidence(runs: ReturnType<typeof normalizeCiRuns>): MasonCiResult {
  if (runs.length === 0) return { status: "pending", requiredChecksPassed: false, detail: "missing_required_check_evidence", headSha: null };
  if (runs.some((run) => run.status !== "completed")) return { status: "pending", requiredChecksPassed: false, detail: "required_checks_pending", headSha: runs[0]?.headSha ?? null };
  if (runs.some((run) => run.conclusion !== "success")) return { status: "failed", requiredChecksPassed: false, detail: "required_check_failed", headSha: runs[0]?.headSha ?? null };
  return { status: "passed", requiredChecksPassed: true, detail: "required_checks_passed", headSha: runs[0]?.headSha ?? null };
}

function isNextRequestScopeError(error: unknown): boolean {
  return error instanceof Error && (error.message.includes("outside a request scope") || error.message.includes("next-dynamic-api-wrong-context"));
}

function requesterRole(authorization: MasonRequesterAuthorization): "founder" | "subscriber" {
  return authorization.verified && (authorization.role === "founder" || authorization.role === "admin")
    ? "founder"
    : "subscriber";
}

export interface MasonEngineeringMessageInput {
  userId: string;
  message: string;
  requesterAuthorization?: MasonRequesterAuthorization;
  founderApproved?: boolean;
  companyId?: string | null;
  repository?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  requestedOutcome?: MasonRequestedOutcome;
  repositoryEvidenceReferences?: string[];
  baseBranch?: string | null;
  branchName?: string | null;
  fileChanges?: MasonLiveFileChange[];
  issueTitle?: string | null;
  issueBody?: string | null;
  issueLabels?: string[];
}

export async function handleMasonEngineeringMessage(input: MasonEngineeringMessageInput) {
  const companyId = input.companyId ?? "aios";
  const repository = input.repository ?? process.env.HARMONY_DEFAULT_GITHUB_REPO ?? process.env.GITHUB_DEFAULT_REPO ?? "AIOS-HQ/aios-platform";
  const authorization = input.requesterAuthorization ?? {
    role: "system",
    verified: false,
    source: "trusted_runtime",
  } satisfies MasonRequesterAuthorization;
  const role = requesterRole(authorization);
  const approved = Boolean(
    authorization.verified &&
      (authorization.role === "founder" || authorization.role === "admin") &&
      (authorization.source === "approved_payload" || input.founderApproved === true),
  );

  const identity = createMasonExecutionIdentity({
    userId: input.userId,
    companyId,
    actorId: input.userId,
    source: authorization.source === "approved_payload" ? "approved_payload" : authorization.source === "server_session" ? "founder_session" : "harmony",
    repository,
    objective: input.message,
    branch: input.branchName,
    correlationId: input.correlationId,
    causationId: input.causationId,
  });
  const task = createMasonEngineeringTaskContract({
    objective: input.message,
    repository,
    executionIdentity: identity,
    requestedOutcome: input.requestedOutcome,
    repositoryEvidenceReferences: input.repositoryEvidenceReferences,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    fileChanges: input.fileChanges,
    issueTitle: input.issueTitle,
    issueBody: input.issueBody,
    issueLabels: input.issueLabels,
  });

  const mayReadEngineeringMemory = authorization.verified && authorization.role !== "system";
  const retrieval = mayReadEngineeringMemory
    ? await retrieveMasonExecutionContext({
        context: {
          company_id: companyId,
          user_id: input.userId,
          actor_id: "mason",
          execution_id: identity.executionId,
          correlation_id: identity.correlationId,
          causation_id: identity.causationId,
          worker_id: "mason",
          source_type: "mason_runtime",
          source_id: `mason-action:${identity.executionId}`,
          approval_id: null,
          trace: { path: "workforce.mason-action", taskVersion: task.version },
        },
        engineeringQuery: input.message,
      })
    : {
        status: "degraded" as const,
        context: {
          company_id: companyId,
          user_id: input.userId,
          actor_id: "mason",
          execution_id: identity.executionId,
          correlation_id: identity.correlationId,
          causation_id: identity.causationId,
          worker_id: "mason" as const,
          source_type: "mason_runtime" as const,
          source_id: `mason-action:${identity.executionId}`,
          timestamp: new Date().toISOString(),
          trace: { path: "workforce.mason-action", taskVersion: task.version },
        },
        entries: [],
        degraded: true,
        error: "verified_founder_context_required",
      };

  if (retrieval.status === "failed") {
    return {
      status: "blocked" as const,
      summary: `Julius retrieval failed before Mason planning: ${retrieval.error}`,
      pullRequestUrl: null,
      previewUrl: null,
      diagnostics: {
        executionId: identity.executionId,
        correlationId: identity.correlationId,
        retrievalStatus: retrieval.status,
        retrievalEntries: retrieval.entries.length,
        retrievalError: retrieval.error,
      },
    };
  }

  const runtimePlan = createMasonNativeRuntimePlan({
    objective: task.objective,
    repository: task.repository,
    architectureNotes: ["The typed Engineering Task Contract and existing governance spine are authoritative."],
  });
  const engineeringFoundation = runtimePlan.executionPlan.engineeringFoundation;

  let productionResult: MasonProductionRuntimeResult | null = null;
  const runtimeInput = {
    companyId,
    userId: input.userId,
    objective: task.objective,
    repository: task.repository,
    requesterRole: role,
    requestedOutcome: task.requestedOutcome,
    founderApproved: approved,
    baseBranch: task.runtimeRequest.baseBranch,
    branchName: task.runtimeRequest.branchName,
    fileChanges: task.runtimeRequest.fileChanges,
    openPullRequest: task.runtimeRequest.openPullRequest,
    issueTitle: task.runtimeRequest.issueTitle,
    issueBody: task.runtimeRequest.issueBody,
    issueLabels: task.runtimeRequest.issueLabels,
    executionIdentity: identity,
    taskContract: task,
    runtimePlan,
  } as const;

  const adapters: MasonClosedLoopAdapters = {
    retrieveContext: async () => ({ found: retrieval.status === "found", status: retrieval.status }),
    createPlan: async () => ({
      summary: [
        `Grounded plan ${engineeringFoundation.groundedPlan.status}.`,
        `Context ${engineeringFoundation.contextPackage.contextId}.`,
        engineeringFoundation.groundedPlan.chosenSolution,
      ].join(" "),
    }),
    runExecution: async () => {
      productionResult = await runMasonProductionRuntime(runtimeInput);
      return productionResult;
    },
    runValidation: async () => ({ ok: false, detail: "validation_requires_external_ci_evidence" }),
    planCorrection: async () => ({ detail: "self_repair_not_implemented" }),
    runCorrection: async () => ({ ok: false, detail: "self_repair_not_implemented" }),
    createCommit: async () => { throw new Error("commit_must_come_from_production_runtime"); },
    pushBranch: async () => { throw new Error("push_must_come_from_production_runtime"); },
    createPullRequest: async () => { throw new Error("pull_request_must_come_from_production_runtime"); },
    readCiStatus: async () => {
      const repoRef = parseRepo(repository);
      if (!repoRef || !productionResult?.pullRequestNumber) {
        return { status: "pending", requiredChecksPassed: false, detail: "missing_pull_request_identity", headSha: null };
      }
      const ci = await runGithubRead(input.userId, "review_build_result", { repo: `${repoRef.owner}/${repoRef.name}` });
      return ci.ok ? classifyCiEvidence(normalizeCiRuns(ci.data)) : { status: "failed", requiredChecksPassed: false, detail: "ci_evidence_fetch_failed", headSha: null };
    },
    decideRemediation: async () => ({ run: false, detail: "self_repair_not_implemented" }),
    runRemediation: async () => ({ ok: false, detail: "self_repair_not_implemented" }),
    hasRemediationChanges: async () => false,
    refreshPrHeadSha: async () => {
      const repoRef = parseRepo(repository);
      if (!repoRef) return null;
      const checks = await runGithubRead(input.userId, "review_build_result", { repo: `${repoRef.owner}/${repoRef.name}` });
      return checks.ok ? normalizeCiRuns(checks.data)[0]?.headSha ?? null : null;
    },
    sleep: async () => undefined,
    evaluateMergeGate: async ({ ci, expectedHeadSha }) => {
      if (!productionResult?.pullRequestNumber) return { ready: false, detail: "missing_pull_request_identity" };
      if (ci.status !== "passed" || !ci.requiredChecksPassed) return { ready: false, detail: ci.detail ?? "required_checks_not_passed" };
      if (!ci.headSha || (expectedHeadSha && ci.headSha !== expectedHeadSha)) {
        return { ready: false, detail: "stale_or_missing_head_sha", expectedHeadSha, actualHeadSha: ci.headSha ?? null };
      }
      const deployment = await getCanonicalVercelDeploymentStatus(input.userId, {
        repo: repository,
        branch: productionResult.branch ?? task.runtimeRequest.branchName,
        environment: "preview",
        requestedGitSha: ci.headSha,
        previewUrl: productionResult.previewUrl,
      });
      if (deployment.status !== "healthy" || deployment.gitShaMatches !== true) {
        return { ready: false, detail: `vercel_${deployment.status}`, vercelStatus: deployment.status, vercelEvidenceTier: deployment.evidenceTier, vercelGitShaMatches: deployment.gitShaMatches };
      }
      return {
        ready: false,
        detail: "founder_merge_authorization_required",
        expectedHeadSha: expectedHeadSha ?? ci.headSha,
        actualHeadSha: ci.headSha,
        mergeable: "unknown",
        reviewDecision: "unknown",
        prOpen: true,
        vercelStatus: deployment.status,
        vercelEvidenceTier: deployment.evidenceTier,
        vercelGitShaMatches: deployment.gitShaMatches,
      };
    },
    performMerge: async () => { throw new Error("mason_has_no_merge_authority"); },
    writeJulius: async ({ terminalState, report }) => {
      const successful = terminalState === "completed" && productionResult?.status === "completed";
      const category = successful ? "engineering_completion" : terminalState === "failed" ? "failure_lesson" : "approved_blocker";
      await recordMasonEngineeringLearning({
        userId: input.userId,
        companyId,
        executionId: identity.executionId,
        successful,
        summary: productionResult?.summary ?? report.terminalState,
        julius: {
          context: {
          company_id: companyId,
          user_id: input.userId,
          actor_id: "mason",
          execution_id: identity.executionId,
          correlation_id: identity.correlationId,
          causation_id: identity.causationId,
          worker_id: "mason",
          source_type: "mason_runtime",
          source_id: `mason-runtime:${identity.executionId}`,
          approval_id: null,
          trace: { retrievalStatus: retrieval.status, terminalState },
        },
          category,
          verification: "verified",
          policy: { approved, requiresApproval: task.approvalRequirements.required, approvalId: null },
          outcome: {
            status: successful ? "completed" : terminalState === "failed" ? "failed" : "blocked",
            summary: productionResult?.summary ?? report.terminalState,
            details: null,
          },
          source: { source_type: "mason_runtime", source_id: `mason-runtime:${identity.executionId}` },
          trace: { retrievalStatus: retrieval.status, retrievalEntries: retrieval.entries.length },
        },
      });
    },
    appendLedger: async ({ state, detail }) => {
      const eventType = state === "execution_started" ? "execution_started" : state === "approval_pending" ? "reporting_completed" : state === "validation_requested" || state === "validation_running" ? "validation_started" : state === "validation_passed" ? "validation_completed" : state === "completed" ? "execution_completed" : state === "failed" || state === "escalated" || state === "ci_failed" ? "execution_failed" : state === "objective_received" ? "intake_received" : "connector_operation_completed";
      let appended = null;
      try {
        appended = await appendMasonLedgerEvent({
          executionId: identity.executionId,
          userId: input.userId,
          companyId,
          eventType,
          runtimeState: state,
          operationType: "mason_closed_loop",
          resultStatus: state === "failed" || state === "escalated" || state === "ci_failed" ? "failed" : state === "approval_pending" || state === "merge_blocked" || state === "ci_pending" ? "blocked" : "ok",
          summary: detail ?? state,
          metadata: { state, correlationId: identity.correlationId, taskVersion: task.version },
          idempotencyKey: `${identity.executionId}:closed_loop:${state}:${detail ?? "none"}`,
        });
      } catch (error) {
        if (isNextRequestScopeError(error)) return;
        throw error;
      }
      if (!appended) throw new Error(`ledger_append_failed:${state}`);
    },
    buildFinalReport: async ({ terminalState, states, validationAttempts, ciAttempts, ciPassed, merged, unresolvedGate }) => ({
      terminalState,
      merged,
      ciPassed,
      unresolvedGate,
      validationAttempts,
      ciAttempts,
      states: states.map((state) => state.state),
    }),
    loadSnapshot: async (executionId) => {
      let timeline;
      try {
        timeline = await listMasonExecutionTimeline({ executionId, companyId, userId: input.userId });
      } catch (error) {
        if (isNextRequestScopeError(error)) return null;
        throw error;
      }
      if (!timeline.length) return null;
      const mapped = timeline
        .filter((event) => event.operation_type === "mason_closed_loop" && typeof event.metadata?.state === "string")
        .reverse()
        .map((event) => event.metadata.state as MasonClosedLoopState);
      return {
        companyId,
        correlationId: identity.correlationId,
        executionId,
        terminalState: mapped.includes("failed") ? "failed" : mapped.includes("escalated") ? "escalated" : mapped.includes("approval_pending") ? "awaiting_founder_approval" : "completed",
        currentState: mapped.at(-1) ?? "objective_received",
        completedStates: mapped,
        irreversible: { commitCreated: mapped.includes("commit_created"), branchPushed: mapped.includes("branch_pushed"), pullRequestCreated: mapped.includes("pull_request_created"), merged: false },
        unresolvedGate: mapped.includes("merge_blocked"),
        validationAttempts: mapped.filter((state) => state === "correction_running").length,
        ciAttempts: mapped.filter((state) => state === "remediation_running").length,
        updatedAt: timeline[0].created_at,
      };
    },
    saveSnapshot: async ({ currentState, completedStates, validationAttempts, ciAttempts, unresolvedGate, updatedAt }) => {
      try {
        await appendMasonLedgerEvent({
          executionId: identity.executionId,
          userId: input.userId,
          companyId,
          eventType: "reporting_completed",
          runtimeState: currentState,
          operationType: "mason_closed_loop_snapshot",
          resultStatus: unresolvedGate ? "blocked" : "ok",
          summary: "mason_closed_loop_snapshot_saved",
          metadata: { currentState, completedStates, validationAttempts, ciAttempts, unresolvedGate, updatedAt, correlationId: identity.correlationId },
          idempotencyKey: `${identity.executionId}:closed_loop_snapshot:${currentState}:${validationAttempts}:${ciAttempts}`,
        });
      } catch (error) {
        if (!isNextRequestScopeError(error)) throw error;
      }
    },
  };

  const loop = await runMasonClosedLoopExecution(
    {
      executionId: identity.executionId,
      correlationId: identity.correlationId,
      companyId,
      actorId: identity.actorId,
      objective: task.objective,
      repository,
      branch: task.runtimeRequest.branchName,
    },
    adapters,
    { maxValidationCorrectionAttempts: 0, maxCiRemediationAttempts: 0 },
  );

  const result = productionResult as MasonProductionRuntimeResult | null;
  if (!result) throw new Error("mason_production_runtime_not_invoked");
  return {
    ...result,
    summary: `${result.summary} (Julius retrieval: ${retrieval.status}${retrieval.status === "found" ? `, entries=${retrieval.entries.length}` : ""})`,
    diagnostics: {
      executionId: identity.executionId,
      correlationId: identity.correlationId,
      causationId: identity.causationId,
      retrievalStatus: retrieval.status,
      retrievalEntries: retrieval.entries.length,
      taskVersion: task.version,
      riskClassification: task.riskClassification,
      protectedResources: task.protectedResources.map((resource) => ({ kind: resource.kind, path: resource.path })),
      closedLoopTerminalState: loop.terminalState,
      contextPackageId: engineeringFoundation.contextPackage.contextId,
    },
  };
}
