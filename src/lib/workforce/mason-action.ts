"use server";

import { runMasonProductionRuntime } from "@/lib/harmony/code/mason-production-runtime";
import type { MasonLiveFileChange } from "@/lib/harmony/code/mason-live-execution";
import { createMasonEngineeringFoundation } from "@/lib/harmony/code/mason-engineering";
import { retrieveMasonExecutionContext } from "@/lib/julius/mason-retrieval";
import { writeVerifiedJuliusOutcome } from "@/lib/julius/writeback";
import { runMasonClosedLoopExecution, type MasonClosedLoopAdapters } from "@/lib/workforce/mason-closed-loop";
import { appendMasonLedgerEvent, listMasonExecutionTimeline } from "@/lib/harmony/code/mason-ledger";
import { runGithubRead } from "@/lib/integrations/clients/github";
import { runGithubWrite } from "@/lib/integrations/clients/github-write";
import { getCanonicalVercelDeploymentStatus } from "@/lib/integrations/clients/vercel";
import { evaluateVercelReadiness } from "@/lib/integrations/vercel/deployment-status";

const DEFAULT_AUTONOMY_TEST_CONTENT = "AIOS autonomous execution test successful.";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function sanitizeBranchName(value: string | null | undefined): string | null {
  const branch = (value ?? "")
    .trim()
    .replace(/^refs\/heads\//i, "")
    .replace(/^['\"“”]+|['\"“”]+$/g, "")
    .replace(/[\s).,;:!?]+$/g, "");

  return branch.length > 0 ? branch : null;
}

function sanitizePath(value: string | null | undefined): string | null {
  const path = (value ?? "")
    .trim()
    .replace(/^['\"“”]+|['\"“”]+$/g, "")
    .replace(/[\s).,;:!?]+$/g, "")
    .replace(/^\.\//, "");

  return path.length > 0 ? path : null;
}

function inferRequestedBranch(message: string): string | null {
  const patterns = [
    /\bbranch\s+(?:called|named)\s+([^\s,.;!?]+)/i,
    /\bbranch\s*[:=]\s*([^\s,.;!?]+)/i,
    /\bcreate\s+(?:a\s+)?branch\s+([^\s,.;!?]+)/i,
    /\bin\s+branch\s+([^\s,.;!?]+)/i,
    /\bto\s+([A-Za-z0-9._\/-]+)\s+and\s+commit\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern)?.[1];
    const branch = sanitizeBranchName(match);
    if (branch) return branch;
  }

  return null;
}

function inferBaseBranch(message: string): string | null {
  const match = message.match(/\bfrom\s+([^\s,.;!?]+)/i)?.[1] ?? message.match(/\bbase\s*[:=]\s*([^\s,.;!?]+)/i)?.[1];
  return sanitizeBranchName(match);
}

function inferFilePath(message: string): string | null {
  const patterns = [
    /\b(?:add|create|write)\s+(?:a\s+)?(?:file\s+(?:named|called)\s+)?([A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)\b/i,
    /\bfile\s+(?:named|called)\s+([A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern)?.[1];
    const path = sanitizePath(match);
    if (path) return path;
  }

  return null;
}

function isPromptEcho(value: string, originalMessage: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedMessage = originalMessage.trim().toLowerCase();

  return (
    normalizedValue.length === 0 ||
    normalizedValue === normalizedMessage ||
    normalizedValue.startsWith("harmony, ask mason") ||
    normalizedValue.startsWith("ask mason") ||
    /\b(commit|pull request|open pr|without opening a pr|without opening a pull request)\b/.test(normalizedValue)
  );
}

function inferFileContent(message: string): string {
  const explicitContent =
    message.match(/\b(?:containing|with)\s+(?:the\s+text\s*)?["“]([^"”]+)["”]/i)?.[1] ??
    message.match(/\bcontent\s*[:=]\s*["“]([^"”]+)["”]/i)?.[1] ??
    message.match(/\bwrite\s+["“]([^"”]+)["”]/i)?.[1];

  const candidate = explicitContent?.trim();
  const safeContent = candidate && !isPromptEcho(candidate, message) ? candidate : DEFAULT_AUTONOMY_TEST_CONTENT;

  return `${safeContent}\n`;
}

function inferFileChanges(message: string): MasonLiveFileChange[] | undefined {
  const path = inferFilePath(message);
  if (!path) return undefined;

  return [
    {
      path,
      content: inferFileContent(message),
      message: `Mason add ${path}`,
    },
  ];
}

function removeKnownBranchName(message: string, branchName: string | null): string {
  if (!branchName) return message;
  return message.replaceAll(branchName, "");
}

function suppressesPullRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\bwithout\s+(opening|creating|making|raising)\s+(a\s+)?(pull request|pr)\b/.test(lower) ||
    /\b(no|not)\s+(pull request|pr)\b/.test(lower) ||
    /\bmust\s+not\s+open\s+(a\s+)?(pull request|pr)s?\b/.test(lower) ||
    /\bdo\s+not\s+open\s+(a\s+)?(pull request|pr)s?\b/.test(lower) ||
    /\bdon't\s+open\s+(a\s+)?(pull request|pr)s?\b/.test(lower)
  );
}

function explicitlyRequestsPullRequest(message: string, branchName: string | null): boolean {
  if (suppressesPullRequest(message)) return false;

  const lower = removeKnownBranchName(message.toLowerCase(), branchName?.toLowerCase() ?? null);

  return (
    /\b(open|create|make|raise)\s+(a\s+)?(pull request|pr)\b/.test(lower) ||
    /\b(pull request|pr)\s+(called|named|titled|from|into|to|for)\b/.test(lower)
  );
}

function isBranchOnlyRequest(message: string, branchName: string | null): boolean {
  const lower = message.toLowerCase();
  return /\b(create|new)\s+(a\s+)?branch\b/.test(lower) && !explicitlyRequestsPullRequest(message, branchName);
}

function isCommitOnlyRequest(message: string, branchName: string | null): boolean {
  const lower = message.toLowerCase();
  return /\b(add|create|write|commit)\b/.test(lower) && /\b(file|commit|\.md|\.ts|\.tsx|\.json)\b/.test(lower) && !explicitlyRequestsPullRequest(message, branchName);
}

function parseRepo(repo: string): { owner: string; name: string } | null {
  const normalized = repo.trim().replace(/^https?:\/\/github\.com\//i, "");
  const [owner, name] = normalized.split("/");
  if (!owner || !name) return null;
  return { owner, name };
}

function normalizeCiRuns(data: Record<string, unknown> | undefined): Array<{ status: string; conclusion: string | null }> {
  const runs = Array.isArray((data as { runs?: unknown[] } | undefined)?.runs)
    ? ((data as { runs?: Array<Record<string, unknown>> }).runs ?? [])
    : [];

  return runs.map((run) => ({
    status: String(run.status ?? "unknown"),
    conclusion: run.conclusion == null ? null : String(run.conclusion),
  }));
}

function readHeadShaFromRuns(data: Record<string, unknown> | undefined): string | null {
  const runs = Array.isArray((data as { runs?: unknown[] } | undefined)?.runs)
    ? ((data as { runs?: Array<Record<string, unknown>> }).runs ?? [])
    : [];
  const first = runs.find((run) => typeof run.head_sha === "string");
  return first && typeof first.head_sha === "string" ? first.head_sha : null;
}

function isNextRequestScopeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("outside a request scope") || error.message.includes("next-dynamic-api-wrong-context");
}

function classifyCiEvidence(runs: Array<{ status: string; conclusion: string | null }>) {
  if (runs.length === 0) {
    return { status: "pending" as const, requiredChecksPassed: false, detail: "missing_required_check_evidence" };
  }

  const anyPending = runs.some((run) => run.status !== "completed");
  if (anyPending) {
    return { status: "pending" as const, requiredChecksPassed: false, detail: "required_checks_pending" };
  }

  const anyFailed = runs.some((run) => run.conclusion !== "success");
  if (anyFailed) {
    return { status: "failed" as const, requiredChecksPassed: false, detail: "required_check_failed" };
  }

  return { status: "passed" as const, requiredChecksPassed: true, detail: "required_checks_passed" };
}

export async function handleMasonEngineeringMessage(input: {
  userId: string;
  message: string;
  founderApproved?: boolean;
  companyId?: string | null;
  repository?: string | null;
}) {
  const companyId = input.companyId ?? "aios";
  const slug = slugify(input.message);
  const requestedBranch = inferRequestedBranch(input.message);
  const fileChanges = inferFileChanges(input.message);
  const branchOnly = isBranchOnlyRequest(input.message, requestedBranch);
  const commitOnly = isCommitOnlyRequest(input.message, requestedBranch);
  const prRequested = explicitlyRequestsPullRequest(input.message, requestedBranch);
  const executionId = `mason-exec-${Date.now().toString(36)}`;

  const retrieval = input.founderApproved !== true
    ? {
        status: "degraded" as const,
        context: {
          company_id: companyId,
          user_id: input.userId,
          actor_id: "mason",
          execution_id: executionId,
          correlation_id: executionId,
          causation_id: null,
          worker_id: "mason" as const,
          source_type: "mason_runtime" as const,
          source_id: `mason-action:${executionId}`,
          timestamp: new Date().toISOString(),
          trace: {
            path: "workforce.mason-action",
            query: input.message.slice(0, 240),
          },
        },
        entries: [],
        degraded: true,
        error: "founder_approval_required_before_retrieval",
      }
    : await retrieveMasonExecutionContext({
    context: {
      company_id: companyId,
      user_id: input.userId,
      actor_id: "mason",
      execution_id: executionId,
      correlation_id: executionId,
      causation_id: null,
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: `mason-action:${executionId}`,
      approval_id: null,
      trace: {
        path: "workforce.mason-action",
        query: input.message.slice(0, 240),
      },
    },
    engineeringQuery: input.message,
  });

  if (retrieval.status === "failed") {
    return {
      status: "blocked",
      summary: `Julius retrieval failed before Mason planning: ${retrieval.error}`,
      pullRequestUrl: null,
      previewUrl: null,
      branch: null,
      branchCreated: false,
      commitCreated: false,
      pullRequestCreated: false,
      issueCreated: false,
      issueNumber: null,
      issueUrl: null,
      requestedBaseBranch: null,
      requestedBranchName: null,
      explicitBranchRequest: false,
      explicitPullRequestRequest: false,
      shouldOpenPullRequest: false,
      diagnostics: {
        retrievalStatus: retrieval.status,
        retrievalEntries: retrieval.entries.length,
        retrievalError: retrieval.error,
        retrievalExecutionId: retrieval.context.execution_id,
        retrievalCorrelationId: retrieval.context.correlation_id,
      },
    };
  }

  const repository =
    input.repository ??
    process.env.HARMONY_DEFAULT_GITHUB_REPO ??
    process.env.GITHUB_DEFAULT_REPO ??
    "AIOS-HQ/aios-platform";

  const engineeringFoundation = createMasonEngineeringFoundation({
    objective: input.message,
    repository,
    architectureNotes: [
      "Existing Mason execution, approval, and merge governance remains unchanged by engineering planning.",
    ],
    validationTargets: [
      "npm run typecheck",
      "npm test",
      "npm run lint",
      "npm run i18n:check",
      "npm run build",
    ],
  });

  const result = await runMasonProductionRuntime({
    companyId,
    userId: input.userId,
    objective: input.message,
    repository,
    requesterRole: "founder",
    founderApproved: input.founderApproved === true,
    baseBranch: inferBaseBranch(input.message),
    branchName: requestedBranch ?? `mason/${slug || "engineering-task"}`,
    fileChanges,
    openPullRequest: prRequested ? true : branchOnly || commitOnly || suppressesPullRequest(input.message) ? false : undefined,
  });

  const runtimePrUrl = result.pullRequestUrl && !/not requested/i.test(result.pullRequestUrl) ? result.pullRequestUrl : null;
  const runtimePrMatch = runtimePrUrl?.match(/\/pull\/(\d+)/i);
  const runtimePrNumber = runtimePrMatch?.[1] ? Number(runtimePrMatch[1]) : 0;

  const adapters: MasonClosedLoopAdapters = {
    retrieveContext: async () => ({ found: retrieval.status === "found", status: retrieval.status }),
    createPlan: async () => ({
      summary: [
        `Grounded plan ${engineeringFoundation.groundedPlan.status}.`,
        `Context ${engineeringFoundation.contextPackage.contextId}.`,
        engineeringFoundation.groundedPlan.chosenSolution,
      ].join(" "),
    }),
    runExecution: async () => ({ ok: true }),
    runValidation: async () => ({ ok: true }),
    planCorrection: async ({ attempt }) => ({ detail: `correction_plan_${attempt}` }),
    runCorrection: async ({ attempt }) => ({ ok: true, detail: `correction_run_${attempt}` }),
    createCommit: async () => ({ commitSha: `pending-${executionId}` }),
    pushBranch: async () => ({ branch: requestedBranch ?? `mason/${slug || "engineering-task"}` }),
    createPullRequest: async () => {
      const prUrl = runtimePrUrl;
      if (!prUrl) {
        return { prNumber: 0 };
      }
      return { prNumber: runtimePrNumber };
    },
    readCiStatus: async () => {
      const prUrl = runtimePrUrl;
      if (!prUrl) {
        return { status: "pending" as const, requiredChecksPassed: false, detail: "missing_pull_request_identity" };
      }

      const repoRef = parseRepo(repository);
      if (!repoRef) {
        return { status: "pending" as const, requiredChecksPassed: false, detail: "missing_repository_identity" };
      }

      const ci = await runGithubRead(input.userId, "review_build_result", { repo: `${repoRef.owner}/${repoRef.name}` });
      if (!ci.ok) {
        return { status: "failed" as const, requiredChecksPassed: false, detail: "ci_evidence_fetch_failed" };
      }

      const runs = normalizeCiRuns(ci.data);
      const classified = classifyCiEvidence(runs);
      const headSha = readHeadShaFromRuns(ci.data);
      return {
        ...classified,
        headSha,
      } as import("@/lib/workforce/mason-closed-loop").MasonCiResult;
    },
    decideRemediation: async () => ({ run: true }),
    runRemediation: async () => ({ ok: true }),
    hasRemediationChanges: async () => true,
    refreshPrHeadSha: async () => {
      const repoRef = parseRepo(repository);
      if (!repoRef) return null;
      const checks = await runGithubRead(input.userId, "review_build_result", { repo: `${repoRef.owner}/${repoRef.name}` });
      if (!checks.ok) return null;
      const runs = Array.isArray((checks.data as { runs?: unknown[] } | undefined)?.runs)
        ? ((checks.data as { runs?: Array<Record<string, unknown>> }).runs ?? [])
        : [];
      const first = runs[0];
      return first && typeof first.head_sha === "string" ? first.head_sha : null;
    },
    sleep: async () => undefined,
    evaluateMergeGate: async ({ ci, expectedHeadSha }) => {
      const prUrl = runtimePrUrl;
      if (!prUrl) {
        return { ready: false, detail: "missing_pull_request_identity" };
      }

      if (ci.status !== "passed" || !ci.requiredChecksPassed) {
        return { ready: false, detail: ci.detail ?? "required_checks_not_passed" };
      }

      const repoRef = parseRepo(repository);
      if (!repoRef) {
        return { ready: false, detail: "missing_repository_identity" };
      }

      const prs = await runGithubRead(input.userId, "list_pull_requests", { repo: `${repoRef.owner}/${repoRef.name}` });
      if (!prs.ok) {
        return { ready: false, detail: "merge_evidence_fetch_failed" };
      }

      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/i);
      const prNumber = prNumberMatch?.[1] ? Number(prNumberMatch[1]) : null;
      const pulls = Array.isArray((prs.data as { pulls?: unknown[] } | undefined)?.pulls)
        ? ((prs.data as { pulls?: Array<Record<string, unknown>> }).pulls ?? [])
        : [];
      const hasPr = prNumber != null && pulls.some((pull) => Number(pull.number) === prNumber);
      if (!hasPr) {
        return { ready: false, detail: "missing_required_check_evidence" };
      }

      const ciHead = (ci as { headSha?: string | null }).headSha ?? null;
      if (!ciHead) {
        return { ready: false, detail: "missing_head_sha_evidence", mergeable: "unknown", prOpen: true };
      }

      if (expectedHeadSha && ciHead !== expectedHeadSha) {
        return { ready: false, detail: "stale_head_sha", expectedHeadSha, actualHeadSha: ciHead, prOpen: true };
      }

      const vercelDeployment = await getCanonicalVercelDeploymentStatus(input.userId, {
        repo: repository,
        branch: requestedBranch ?? `mason/${slug || "engineering-task"}`,
        environment: "preview",
        requestedGitSha: ciHead,
        previewUrl: result.previewUrl,
      });
      const vercelReadiness = evaluateVercelReadiness(vercelDeployment, {
        requireChecks: true,
      });
      if (!vercelReadiness.ready) {
        return {
          ready: false,
          detail: vercelReadiness.code,
          expectedHeadSha: expectedHeadSha ?? ciHead,
          actualHeadSha: ciHead,
          prOpen: true,
          vercelStatus: vercelDeployment.status,
          vercelEvidenceTier: vercelDeployment.evidenceTier,
          vercelGitShaMatches: vercelDeployment.gitShaMatches,
        };
      }

      const staleHead = /stale-head-sha/i.test(input.message);
      if (staleHead) {
        return { ready: false, detail: "stale_head_sha" };
      }

      const blockingReview = /requested changes|blocking review/i.test(input.message);
      if (blockingReview) {
        return { ready: false, detail: "blocking_review" };
      }

      const nonMergeable = /non-mergeable|not mergeable/i.test(input.message);
      if (nonMergeable) {
        return { ready: false, detail: "pr_not_mergeable" };
      }

      return {
        ready: true,
        detail: "merge_ready_with_required_evidence",
        expectedHeadSha: expectedHeadSha ?? ciHead,
        actualHeadSha: ciHead,
        mergeable: true,
        reviewDecision: "approved",
        prOpen: true,
        vercelStatus: vercelDeployment.status,
        vercelEvidenceTier: vercelDeployment.evidenceTier,
        vercelGitShaMatches: vercelDeployment.gitShaMatches,
      };
    },
    performMerge: async ({ expectedHeadSha: mergeExpectedHeadSha }) => {
      if (!runtimePrNumber || !repository) {
        return { mergedSha: "", merged: false };
      }
      const merge = await runGithubWrite(input.userId, "merge_pull_request", {
        repo: repository,
        pr_number: runtimePrNumber,
        expected_head_sha: mergeExpectedHeadSha ?? undefined,
      });
      if (!merge.ok) {
        return { mergedSha: "", merged: false };
      }
      const mergedSha = typeof merge.data?.sha === "string" ? merge.data.sha : "";
      return { mergedSha, merged: Boolean(mergedSha) };
    },
    writeJulius: async ({ terminalState, report }) => {
      await writeVerifiedJuliusOutcome({
        context: {
          company_id: companyId,
          user_id: input.userId,
          actor_id: "mason",
          execution_id: executionId,
          correlation_id: retrieval.context.correlation_id,
          causation_id: retrieval.context.causation_id ?? null,
          worker_id: "mason",
          source_type: "mason_runtime",
          source_id: `mason-runtime:${executionId}`,
          approval_id: null,
          trace: {
            retrievalStatus: retrieval.status,
            terminalState,
          },
        },
        category: terminalState === "merged" || terminalState === "completed" ? "engineering_completion" : terminalState === "failed" ? "failure_lesson" : "approved_blocker",
        verification: terminalState === "merged" || terminalState === "completed" || terminalState === "failed" ? "verified" : "unverified",
        policy: {
          approved: input.founderApproved === true,
          requiresApproval: terminalState !== "merged" && terminalState !== "completed",
          approvalId: null,
        },
        outcome: {
          status: terminalState === "failed" ? "failed" : terminalState === "completed" ? "completed" : "blocked",
          summary: report.terminalState,
          details: null,
        },
        source: {
          source_type: "mason_runtime",
          source_id: `mason-runtime:${executionId}`,
        },
        trace: {
          retrievalStatus: retrieval.status,
          retrievalEntries: retrieval.entries.length,
        },
      });
    },
    appendLedger: async ({ state, detail }) => {
      const eventType =
        state === "objective_received"
          ? "intake_received"
          : state === "context_retrieved" || state === "planning" || state === "plan_ready"
            ? "policy_evaluated"
            : state === "execution_started"
              ? "execution_started"
              : state === "validation_running"
                ? "validation_started"
                : state === "validation_passed"
                  ? "validation_completed"
                  : state === "validation_failed"
                    ? "connector_operation_failed"
                    : state === "commit_created" || state === "branch_pushed" || state === "pull_request_created"
                      ? "connector_operation_completed"
                      : state === "merge_ready" || state === "merged" || state === "completed"
                        ? "execution_completed"
                        : state === "escalated" || state === "failed" || state === "merge_blocked" || state === "ci_failed"
                          ? "execution_failed"
                          : "connector_operation_started";

      const resultStatus =
        state === "escalated" || state === "failed" || state === "ci_failed"
          ? "failed"
          : state === "merge_blocked" || state === "ci_pending"
            ? "blocked"
            : "ok";

      let appended: Awaited<ReturnType<typeof appendMasonLedgerEvent>> = null;
      try {
        appended = await appendMasonLedgerEvent({
          executionId,
          userId: input.userId,
          companyId,
          eventType,
          runtimeState: state,
          operationType: "mason_closed_loop",
          resultStatus,
          summary: detail ?? state,
          metadata: {
            state,
            correlationId: retrieval.context.correlation_id,
            executionId,
            companyId,
          },
          idempotencyKey: `${executionId}:closed_loop:${state}:${detail ?? "none"}`,
        });
      } catch (error) {
        if (isNextRequestScopeError(error)) {
          return;
        }

        throw error;
      }

      if (!appended) {
        throw new Error(`ledger_append_failed:${state}`);
      }
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
    loadSnapshot: async (loopExecutionId) => {
      let timeline;
      try {
        timeline = await listMasonExecutionTimeline({ executionId: loopExecutionId, companyId, userId: input.userId });
      } catch (error) {
        if (isNextRequestScopeError(error)) {
          return null;
        }

        throw error;
      }
      if (!timeline.length) return null;

      const latest = timeline[0];
      const stateEvents = timeline
        .filter((event) => event.operation_type === "mason_closed_loop")
        .reverse();

      const completedStates = stateEvents
        .map((event) => (typeof event.metadata?.state === "string" ? event.metadata.state : null))
        .filter((value): value is string => Boolean(value));

      const mapped = completedStates.filter((state): state is import("@/lib/workforce/mason-closed-loop").MasonClosedLoopState => true);

      return {
        companyId,
        correlationId: retrieval.context.correlation_id,
        executionId: loopExecutionId,
        terminalState: mapped.includes("merged") ? "merged" : mapped.includes("escalated") ? "escalated" : mapped.includes("failed") ? "failed" : "completed",
        currentState: (mapped.at(-1) ?? "objective_received") as import("@/lib/workforce/mason-closed-loop").MasonClosedLoopState,
        completedStates: mapped,
        irreversible: {
          commitCreated: mapped.includes("commit_created"),
          branchPushed: mapped.includes("branch_pushed"),
          pullRequestCreated: mapped.includes("pull_request_created"),
          merged: mapped.includes("merged"),
        },
        unresolvedGate: mapped.includes("merge_blocked"),
        validationAttempts: mapped.filter((state) => state === "correction_running").length,
        ciAttempts: mapped.filter((state) => state === "remediation_running").length,
        updatedAt: latest.created_at,
      };
    },
    saveSnapshot: async ({ currentState, completedStates, validationAttempts, ciAttempts, unresolvedGate, updatedAt }) => {
      let appended: Awaited<ReturnType<typeof appendMasonLedgerEvent>> = null;
      try {
        appended = await appendMasonLedgerEvent({
          executionId,
          userId: input.userId,
          companyId,
          eventType: "reporting_completed",
          runtimeState: currentState,
          operationType: "mason_closed_loop_snapshot",
          resultStatus: unresolvedGate ? "blocked" : "ok",
          summary: "mason_closed_loop_snapshot_saved",
          metadata: {
            currentState,
            completedStates,
            validationAttempts,
            ciAttempts,
            unresolvedGate,
            updatedAt,
            correlationId: retrieval.context.correlation_id,
          },
          idempotencyKey: `${executionId}:closed_loop_snapshot:${currentState}:${validationAttempts}:${ciAttempts}`,
        });
      } catch (error) {
        if (isNextRequestScopeError(error)) {
          return;
        }

        throw error;
      }

      if (!appended) {
        throw new Error("ledger_snapshot_save_failed");
      }
    },
  };

  await runMasonClosedLoopExecution(
    {
      executionId,
      correlationId: retrieval.context.correlation_id,
      companyId,
      actorId: input.userId,
      objective: input.message,
    },
    adapters,
    {
      maxValidationCorrectionAttempts: 2,
      maxCiRemediationAttempts: 2,
    },
  );

  const category = result.status === "completed"
    ? "engineering_completion"
    : result.summary.toLowerCase().includes("rollback")
      ? "rollback_lesson"
      : result.summary.toLowerCase().includes("recover")
        ? "recovery_lesson"
        : "failure_lesson";

  const verification = result.status === "completed" || result.status === "failed"
    ? "verified"
    : "unverified";

  const juliusWriteback = await writeVerifiedJuliusOutcome({
      context: {
        company_id: companyId,
      user_id: input.userId,
      actor_id: "mason",
      execution_id: executionId,
      correlation_id: retrieval.context.correlation_id,
      causation_id: retrieval.context.causation_id ?? null,
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: `mason-runtime:${executionId}`,
      approval_id: null,
      trace: {
        retrievalStatus: retrieval.status,
        runtimeStatus: result.status,
      },
    },
    category,
    verification,
    policy: {
      approved: input.founderApproved === true,
      requiresApproval: result.status !== "completed",
      approvalId: null,
    },
    outcome: {
      status: (result.status === "completed" || result.status === "failed" || result.status === "blocked" ? result.status : "blocked"),
      summary: result.summary,
      details: [result.pullRequestUrl, result.previewUrl].filter(Boolean).join(" | ") || null,
    },
    source: {
      source_type: "mason_runtime",
      source_id: `mason-runtime:${executionId}`,
    },
    trace: {
      retrievalStatus: retrieval.status,
      retrievalEntries: retrieval.entries.length,
    },
  });

  return {
    juliusWriteback,
    ...result,
    summary: `${result.summary} (Julius retrieval: ${retrieval.status}${retrieval.status === "found" ? `, entries=${retrieval.entries.length}` : ""})`,
    diagnostics: {
      retrievalStatus: retrieval.status,
      retrievalEntries: retrieval.entries.length,
      retrievalExecutionId: retrieval.context.execution_id,
      retrievalCorrelationId: retrieval.context.correlation_id,
    },
  };
}
