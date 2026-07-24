import type { MasonProductionRuntimeResult } from "@/lib/harmony/code/mason-production-runtime";

export type MasonClosedLoopState =
  | "objective_received"
  | "context_retrieved"
  | "planning"
  | "plan_ready"
  | "execution_started"
  | "approval_pending"
  | "validation_requested"
  | "validation_running"
  | "validation_failed"
  | "correction_planned"
  | "correction_running"
  | "validation_passed"
  | "commit_created"
  | "branch_pushed"
  | "pull_request_created"
  | "ci_pending"
  | "ci_failed"
  | "remediation_running"
  | "ci_passed"
  | "merge_blocked"
  | "merge_ready"
  | "merged"
  | "escalated"
  | "failed"
  | "completed";

export type MasonTerminalState = "merged" | "awaiting_founder_approval" | "escalated" | "failed" | "completed";

export type MasonClosedLoopStepRecord = {
  state: MasonClosedLoopState;
  at: string;
  detail?: string;
};

export type MasonClosedLoopConfig = {
  maxValidationCorrectionAttempts: number;
  maxCiRemediationAttempts: number;
};

export type MasonClosedLoopInput = {
  executionId: string;
  correlationId: string;
  companyId: string;
  actorId: string;
  objective: string;
  repository?: string | null;
  branch?: string | null;
  pullRequest?: number | null;
  expectedHeadSha?: string | null;
};

export type MasonPlan = {
  summary: string;
};

export type MasonValidationResult = {
  ok: boolean;
  detail?: string;
};

export type MasonCiResult = {
  status: "pending" | "failed" | "passed";
  requiredChecksPassed?: boolean;
  detail?: string;
  headSha?: string | null;
};

export type MasonMergeGateResult = {
  ready: boolean;
  detail?: string;
  mergeable?: boolean | "unknown";
  reviewDecision?: "approved" | "changes_requested" | "commented" | "unknown";
  expectedHeadSha?: string | null;
  actualHeadSha?: string | null;
  prOpen?: boolean;
  vercelStatus?: string;
  vercelEvidenceTier?: string;
  vercelGitShaMatches?: boolean | null;
};

export type MasonFinalReport = {
  terminalState: MasonTerminalState;
  merged: boolean;
  ciPassed: boolean;
  unresolvedGate: boolean;
  validationAttempts: number;
  ciAttempts: number;
  states: MasonClosedLoopState[];
  artifact?: MasonCompletionArtifact;
};

export type MasonCompletionArtifact = {
  companyId: string;
  executionId: string;
  correlationId: string;
  objective: string;
  repository?: string | null;
  branch?: string | null;
  pullRequest?: number | null;
  finalHeadSha?: string | null;
  ciResult: "passed" | "failed" | "pending" | "unknown";
  validationResult: "passed" | "failed" | "unknown";
  remediationAttempts: number;
  mergeGateEvidence: string;
  mergeCommitSha?: string | null;
  juliusRetrievalResult?: string | null;
  juliusWritebackResult?: string | null;
  ledgerLinked: boolean;
  terminalState: MasonTerminalState;
  unresolvedBlockers: string[];
  startedAt: string;
  completedAt: string;
};

export type MasonClosedLoopResult = {
  executionId: string;
  correlationId: string;
  terminalState: MasonTerminalState;
  states: MasonClosedLoopStepRecord[];
  report: MasonFinalReport;
};

export type MasonClosedLoopSnapshot = {
  companyId: string;
  correlationId: string;
  executionId: string;
  terminalState: MasonTerminalState;
  currentState: MasonClosedLoopState;
  completedStates: MasonClosedLoopState[];
  irreversible: {
    commitCreated: boolean;
    branchPushed: boolean;
    pullRequestCreated: boolean;
    merged: boolean;
  };
  unresolvedGate: boolean;
  validationAttempts: number;
  ciAttempts: number;
  ciPollAttempts?: number;
  ciExpectedHeadSha?: string | null;
  updatedAt: string;
};

export type MasonClosedLoopAdapters = {
  retrieveContext: (input: MasonClosedLoopInput) => Promise<{ found: boolean; status: string }>;
  createPlan: (input: MasonClosedLoopInput) => Promise<MasonPlan>;
  runExecution: (input: MasonClosedLoopInput & { plan: MasonPlan }) => Promise<MasonProductionRuntimeResult | { ok: boolean; detail?: string }>;
  runValidation: (input: MasonClosedLoopInput) => Promise<MasonValidationResult>;
  planCorrection: (input: MasonClosedLoopInput & { attempt: number }) => Promise<{ detail?: string }>;
  runCorrection: (input: MasonClosedLoopInput & { attempt: number }) => Promise<{ ok: boolean; detail?: string }>;
  createCommit: (input: MasonClosedLoopInput) => Promise<{ commitSha: string }>;
  pushBranch: (input: MasonClosedLoopInput) => Promise<{ branch: string }>;
  createPullRequest: (input: MasonClosedLoopInput) => Promise<{ prNumber: number }>;
  readCiStatus: (input: MasonClosedLoopInput & { attempt: number }) => Promise<MasonCiResult>;
  decideRemediation: (input: MasonClosedLoopInput & { attempt: number; ci: MasonCiResult }) => Promise<{ run: boolean; detail?: string }>;
  runRemediation: (input: MasonClosedLoopInput & { attempt: number }) => Promise<{ ok: boolean; detail?: string }>;
  hasRemediationChanges?: (input: MasonClosedLoopInput & { attempt: number }) => Promise<boolean>;
  refreshPrHeadSha?: (input: MasonClosedLoopInput) => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
  evaluateMergeGate: (input: MasonClosedLoopInput & { ci: MasonCiResult }) => Promise<MasonMergeGateResult>;
  performMerge: (input: MasonClosedLoopInput & { expectedHeadSha?: string | null }) => Promise<{ mergedSha: string; merged?: boolean }>;
  writeJulius: (input: MasonClosedLoopInput & { terminalState: MasonTerminalState; report: MasonFinalReport }) => Promise<void>;
  appendLedger: (input: MasonClosedLoopInput & { state: MasonClosedLoopState; detail?: string }) => Promise<void>;
  buildFinalReport: (input: MasonClosedLoopInput & { terminalState: MasonTerminalState; states: MasonClosedLoopStepRecord[]; validationAttempts: number; ciAttempts: number; ciPassed: boolean; merged: boolean; unresolvedGate: boolean }) => Promise<MasonFinalReport>;
  loadSnapshot: (executionId: string) => Promise<MasonClosedLoopSnapshot | null>;
  saveSnapshot: (snapshot: MasonClosedLoopSnapshot) => Promise<void>;
};

const LEGAL_TRANSITIONS: Record<MasonClosedLoopState, readonly MasonClosedLoopState[]> = {
  objective_received: ["context_retrieved", "failed"],
  context_retrieved: ["planning", "failed"],
  planning: ["plan_ready", "failed"],
  plan_ready: ["execution_started", "failed"],
  execution_started: ["approval_pending", "validation_requested", "validation_running", "failed"],
  approval_pending: ["completed"],
  validation_requested: ["commit_created", "branch_pushed", "pull_request_created", "ci_pending", "completed", "failed"],
  validation_running: ["validation_passed", "validation_failed", "failed"],
  validation_failed: ["correction_planned", "escalated", "failed"],
  correction_planned: ["correction_running", "escalated", "failed"],
  correction_running: ["validation_running", "escalated", "failed"],
  validation_passed: ["commit_created", "failed"],
  commit_created: ["branch_pushed", "pull_request_created", "ci_pending", "completed", "failed"],
  branch_pushed: ["pull_request_created", "ci_pending", "completed", "failed"],
  pull_request_created: ["ci_pending", "completed", "failed"],
  ci_pending: ["ci_failed", "ci_passed", "merge_blocked", "failed"],
  ci_failed: ["remediation_running", "escalated", "failed"],
  remediation_running: ["ci_pending", "escalated", "failed"],
  ci_passed: ["merge_ready", "merge_blocked", "failed"],
  merge_blocked: ["escalated", "failed", "ci_failed"],
  merge_ready: ["merged", "failed"],
  merged: ["completed"],
  escalated: ["completed"],
  failed: ["completed"],
  completed: [],
};

function nowIso() {
  return new Date().toISOString();
}

export function assertLegalTransition(from: MasonClosedLoopState, to: MasonClosedLoopState): void {
  const legal = LEGAL_TRANSITIONS[from] ?? [];
  if (!legal.includes(to)) {
    throw new Error(`invalid_transition:${from}->${to}`);
  }
}

export async function runMasonClosedLoopExecution(
  input: MasonClosedLoopInput,
  adapters: MasonClosedLoopAdapters,
  config: MasonClosedLoopConfig,
): Promise<MasonClosedLoopResult> {
  const startedAt = nowIso();
  const existing = await adapters.loadSnapshot(input.executionId);
  if (existing && ["merged", "awaiting_founder_approval", "completed", "failed", "escalated"].includes(existing.terminalState)) {
    const terminalState = existing.terminalState;
    const states = existing.completedStates.map((state) => ({ state, at: nowIso() }));
    const report = await adapters.buildFinalReport({
      ...input,
      terminalState,
      states,
      validationAttempts: existing.validationAttempts,
      ciAttempts: existing.ciAttempts,
      ciPassed: existing.completedStates.includes("ci_passed"),
      merged: existing.irreversible.merged,
      unresolvedGate: existing.unresolvedGate || existing.completedStates.includes("merge_blocked"),
    });
    report.artifact = {
      companyId: input.companyId,
      executionId: input.executionId,
      correlationId: input.correlationId,
      objective: input.objective,
      repository: input.repository ?? null,
      branch: input.branch ?? null,
      pullRequest: input.pullRequest ?? null,
      finalHeadSha: existing.ciExpectedHeadSha ?? null,
      ciResult: existing.completedStates.includes("ci_passed") ? "passed" : existing.completedStates.includes("ci_failed") ? "failed" : existing.completedStates.includes("ci_pending") ? "pending" : "unknown",
      validationResult: existing.completedStates.includes("validation_passed") ? "passed" : existing.completedStates.includes("validation_failed") ? "failed" : "unknown",
      remediationAttempts: existing.ciAttempts,
      mergeGateEvidence: existing.completedStates.includes("merge_ready") ? "merge_ready" : "merge_blocked_or_unknown",
      mergeCommitSha: null,
      juliusRetrievalResult: null,
      juliusWritebackResult: null,
      ledgerLinked: true,
      terminalState,
      unresolvedBlockers: existing.unresolvedGate ? ["unresolved_gate"] : [],
      startedAt,
      completedAt: nowIso(),
    };
    return { executionId: input.executionId, correlationId: input.correlationId, terminalState, states, report };
  }

  const states: MasonClosedLoopStepRecord[] = [];
  let current: MasonClosedLoopState = "objective_received";
  let validationAttempts = existing?.validationAttempts ?? 0;
  let ciAttempts = existing?.ciAttempts ?? 0;
  let ciPollAttempts = existing?.ciPollAttempts ?? 0;
  let expectedHeadSha = existing?.ciExpectedHeadSha ?? null;
  let ciPassed = false;
  let merged = existing?.irreversible.merged ?? false;
  let unresolvedGate = false;

  const done = new Set<MasonClosedLoopState>(existing?.completedStates ?? []);

  const transition = async (to: MasonClosedLoopState, detail?: string, force = false) => {
    if (force || !done.has(to)) {
      assertLegalTransition(current, to);
      current = to;
      done.add(to);
      const entry: MasonClosedLoopStepRecord = { state: to, at: nowIso(), detail };
      states.push(entry);
      await adapters.appendLedger({ ...input, state: to, detail });
      await adapters.saveSnapshot({
        companyId: input.companyId,
        correlationId: input.correlationId,
        executionId: input.executionId,
        terminalState: (to === "completed"
          ? merged
            ? "merged"
            : done.has("escalated")
              ? "escalated"
              : done.has("approval_pending")
                ? "awaiting_founder_approval"
              : done.has("failed")
                ? "failed"
                : "completed"
          : (existing?.terminalState ?? "completed")) as MasonTerminalState,
        currentState: to,
        completedStates: Array.from(done),
        irreversible: {
          commitCreated: done.has("commit_created"),
          branchPushed: done.has("branch_pushed"),
          pullRequestCreated: done.has("pull_request_created"),
          merged,
        },
        unresolvedGate,
        validationAttempts,
        ciAttempts,
        ciPollAttempts,
        ciExpectedHeadSha: expectedHeadSha,
        updatedAt: nowIso(),
      });
    }
  };

  states.push({ state: "objective_received", at: nowIso() });
  if (!done.has("objective_received")) {
    done.add("objective_received");
    await adapters.appendLedger({ ...input, state: "objective_received" });
  }

  await transition("context_retrieved", (await adapters.retrieveContext(input)).status);
  await transition("planning");
  const plan = await adapters.createPlan(input);
  await transition("plan_ready", plan.summary);
  await transition("execution_started");
  const runtimeExecution = await adapters.runExecution({ ...input, plan });
  const productionExecution = "status" in runtimeExecution ? runtimeExecution : null;

  if (productionExecution?.status === "blocked") {
    await transition("approval_pending", productionExecution.summary);
    await transition("completed");
    const report = await adapters.buildFinalReport({
      ...input,
      terminalState: "awaiting_founder_approval",
      states,
      validationAttempts,
      ciAttempts,
      ciPassed,
      merged,
      unresolvedGate: true,
    });
    await adapters.writeJulius({ ...input, terminalState: "awaiting_founder_approval", report });
    return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "awaiting_founder_approval", states, report };
  }

  if (productionExecution?.status === "failed") {
    await transition("failed", productionExecution.summary);
    await transition("completed");
    const report = await adapters.buildFinalReport({
      ...input,
      terminalState: "failed",
      states,
      validationAttempts,
      ciAttempts,
      ciPassed,
      merged,
      unresolvedGate: true,
    });
    await adapters.writeJulius({ ...input, terminalState: "failed", report });
    return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "failed", states, report };
  }

  if (productionExecution?.validationMode === "external_ci") {
    await transition("validation_requested", "validation_deferred_to_exact_head_ci");
    expectedHeadSha = productionExecution.commitSha;
    if (productionExecution.commitSha) {
      await transition("commit_created", productionExecution.commitSha);
    }
    if (productionExecution.branch) {
      await transition("branch_pushed", productionExecution.branch);
    }
    if (productionExecution.pullRequestNumber) {
      await transition("pull_request_created", String(productionExecution.pullRequestNumber));
    } else {
      await transition("completed", "runtime_completed_without_pull_request");
      const report = await adapters.buildFinalReport({
        ...input,
        terminalState: "completed",
        states,
        validationAttempts,
        ciAttempts,
        ciPassed: false,
        merged: false,
        unresolvedGate: false,
      });
      await adapters.writeJulius({ ...input, terminalState: "completed", report });
      return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "completed", states, report };
    }
  }

  let validated = productionExecution?.validationMode === "external_ci";
  while (!validated) {
    await transition("validation_running");
    const validation = await adapters.runValidation(input);
    if (validation.ok) {
      if (done.has("correction_running")) {
        await transition("validation_running", `post_correction_attempt_${validationAttempts}`, true);
      }
      validated = true;
      await transition("validation_passed", validation.detail);
      break;
    }

    await transition("validation_failed", validation.detail);
    if (validationAttempts >= config.maxValidationCorrectionAttempts) {
      await transition("escalated", "validation_retries_exhausted");
      await transition("completed");
      const report = await adapters.buildFinalReport({
        ...input,
        terminalState: "escalated",
        states,
        validationAttempts,
        ciAttempts,
        ciPassed,
        merged,
        unresolvedGate: true,
      });
      await adapters.writeJulius({ ...input, terminalState: "escalated", report });
      return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "escalated", states, report };
    }

    validationAttempts += 1;
    await transition("correction_planned", `attempt_${validationAttempts}`);
    await adapters.planCorrection({ ...input, attempt: validationAttempts });
    await transition("correction_running", `attempt_${validationAttempts}`);
    await adapters.runCorrection({ ...input, attempt: validationAttempts });
  }

  if (!productionExecution && !done.has("commit_created")) {
    const commit = await adapters.createCommit(input);
    await transition("commit_created", commit.commitSha);
  }

  if (!productionExecution && !done.has("branch_pushed")) {
    const pushed = await adapters.pushBranch(input);
    await transition("branch_pushed", pushed.branch);
  }

  if (!productionExecution && !done.has("pull_request_created")) {
    const pr = await adapters.createPullRequest(input);
    await transition("pull_request_created", String(pr.prNumber));
  }

  let ci: MasonCiResult = { status: "pending" };
  while (true) {
    await transition("ci_pending");
    const maxPollAttempts = 5;
    const pollDelayMs = 10;
    const backoffFactor = 1;
    const timeoutMs = 10_000;
    const startedAt = Date.now();
    let pollAttempt = 0;

    while (true) {
      pollAttempt += 1;
      ciPollAttempts += 1;
      try {
        ci = await adapters.readCiStatus({ ...input, attempt: ciAttempts + 1 });
      } catch {
        ci = { status: "failed", requiredChecksPassed: false, detail: "ci_evidence_fetch_failed" };
      }

      const actualHead = (ci as MasonCiResult & { headSha?: string | null }).headSha ?? null;
      if (expectedHeadSha && actualHead && expectedHeadSha !== actualHead) {
        ci = { status: "failed", requiredChecksPassed: false, detail: "stale_head_sha" };
      }

      if (ci.status === "pending") {
        const timedOut = Date.now() - startedAt >= timeoutMs;
        if (pollAttempt >= maxPollAttempts || timedOut) {
          await transition("merge_blocked", "ci_pending");
          ci = { status: "failed", requiredChecksPassed: false, detail: "ci_poll_timeout" };
          break;
        }
        if (adapters.sleep) {
          await adapters.sleep(pollDelayMs * Math.max(1, backoffFactor ** (pollAttempt - 1)));
        }
        continue;
      }
      break;
    }

    if (ci.status === "pending") {
      await transition("merge_blocked", "ci_pending");
      unresolvedGate = true;
      break;
    }

    if (ci.status === "failed") {
      await transition("ci_failed", ci.detail);
      if (ciAttempts >= config.maxCiRemediationAttempts) {
        await transition("escalated", "ci_retries_exhausted");
        await transition("completed");
        const report = await adapters.buildFinalReport({
          ...input,
          terminalState: "escalated",
          states,
          validationAttempts,
          ciAttempts,
          ciPassed,
          merged,
          unresolvedGate: true,
        });
        await adapters.writeJulius({ ...input, terminalState: "escalated", report });
        return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "escalated", states, report };
      }

      ciAttempts += 1;
      const remediationDecision = await adapters.decideRemediation({ ...input, attempt: ciAttempts, ci });
      if (!remediationDecision.run) {
        await transition("escalated", remediationDecision.detail ?? "ci_remediation_denied");
        await transition("completed");
        const report = await adapters.buildFinalReport({
          ...input,
          terminalState: "escalated",
          states,
          validationAttempts,
          ciAttempts,
          ciPassed,
          merged,
          unresolvedGate: true,
        });
        await adapters.writeJulius({ ...input, terminalState: "escalated", report });
        return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "escalated", states, report };
      }

      await transition("remediation_running", remediationDecision.detail ?? `attempt_${ciAttempts}`);
      await adapters.runRemediation({ ...input, attempt: ciAttempts });
      if (adapters.hasRemediationChanges) {
        const hasChanges = await adapters.hasRemediationChanges({ ...input, attempt: ciAttempts });
        if (!hasChanges) {
          await transition("escalated", "remediation_no_real_changes");
          await transition("completed");
          const report = await adapters.buildFinalReport({
            ...input,
            terminalState: "escalated",
            states,
            validationAttempts,
            ciAttempts,
            ciPassed,
            merged,
            unresolvedGate: true,
          });
          await adapters.writeJulius({ ...input, terminalState: "escalated", report });
          return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "escalated", states, report };
        }
      }
      if (adapters.refreshPrHeadSha) {
        expectedHeadSha = await adapters.refreshPrHeadSha(input);
      }
      continue;
    }

    if (ci.status === "passed") {
      if (done.has("remediation_running")) {
        await transition("ci_pending", `post_remediation_attempt_${ciAttempts}`, true);
      }
      ciPassed = Boolean(ci.requiredChecksPassed ?? true);
      await transition("ci_passed", ci.detail);
      break;
    }
  }

  if (!ciPassed) {
    await transition("merge_blocked", "required_checks_not_passed");
    await transition("escalated", "merge_gate_blocked");
    await transition("completed");
    const report = await adapters.buildFinalReport({
      ...input,
      terminalState: "escalated",
      states,
      validationAttempts,
      ciAttempts,
      ciPassed,
      merged,
      unresolvedGate: true,
    });
    await adapters.writeJulius({ ...input, terminalState: "escalated", report });
    return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "escalated", states, report };
  }

  const gate = await adapters.evaluateMergeGate({ ...input, ci });
  if (!gate.ready) {
    await transition("merge_blocked", gate.detail ?? "merge_gate_not_ready");
    await transition("escalated", "merge_gate_blocked");
    await transition("completed");
    const report = await adapters.buildFinalReport({
      ...input,
      terminalState: "escalated",
      states,
      validationAttempts,
      ciAttempts,
      ciPassed,
      merged,
      unresolvedGate: true,
    });
    await adapters.writeJulius({ ...input, terminalState: "escalated", report });
    return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "escalated", states, report };
  }

  await transition("merge_ready", gate.detail);
  const mergeResult = await adapters.performMerge({ ...input, expectedHeadSha });
  merged = Boolean(mergeResult.mergedSha);

  if (!merged) {
    await transition("failed", "merge_evidence_missing");
    await transition("completed");
    const report = await adapters.buildFinalReport({
      ...input,
      terminalState: "failed",
      states,
      validationAttempts,
      ciAttempts,
      ciPassed,
      merged,
      unresolvedGate: true,
    });
    await adapters.writeJulius({ ...input, terminalState: "failed", report });
    return { executionId: input.executionId, correlationId: input.correlationId, terminalState: "failed", states, report };
  }

  await transition("merged", mergeResult.mergedSha);
  await transition("completed");

  const report = await adapters.buildFinalReport({
    ...input,
    terminalState: "merged",
    states,
    validationAttempts,
    ciAttempts,
    ciPassed,
    merged,
    unresolvedGate,
  });
  report.artifact = {
    companyId: input.companyId,
    executionId: input.executionId,
    correlationId: input.correlationId,
    objective: input.objective,
    repository: input.repository ?? null,
    branch: input.branch ?? null,
    pullRequest: input.pullRequest ?? null,
    finalHeadSha: expectedHeadSha,
    ciResult: ciPassed ? "passed" : "failed",
    validationResult: "passed",
    remediationAttempts: ciAttempts,
    mergeGateEvidence: "all_required_gates_passed",
    mergeCommitSha: mergeResult.mergedSha,
    juliusRetrievalResult: null,
    juliusWritebackResult: null,
    ledgerLinked: true,
    terminalState: "merged",
    unresolvedBlockers: unresolvedGate ? ["unresolved_gate"] : [],
    startedAt,
    completedAt: nowIso(),
  };
  await adapters.writeJulius({ ...input, terminalState: "merged", report });

  return {
    executionId: input.executionId,
    correlationId: input.correlationId,
    terminalState: "merged",
    states,
    report,
  };
}
