import { describe, expect, it, vi } from "vitest";
import { runMasonClosedLoopExecution, type MasonClosedLoopAdapters, type MasonClosedLoopConfig, type MasonClosedLoopInput } from "@/lib/workforce/mason-closed-loop";

const input: MasonClosedLoopInput = {
  executionId: "exec-merge-1",
  correlationId: "corr-merge-1",
  companyId: "co-1",
  actorId: "founder-1",
  objective: "guarded merge",
  repository: "AIOS-HQ/aios-platform",
  branch: "mason/feature",
  pullRequest: 42,
  expectedHeadSha: "head-1",
};

const config: MasonClosedLoopConfig = {
  maxValidationCorrectionAttempts: 1,
  maxCiRemediationAttempts: 1,
};

function adapters(overrides: Partial<MasonClosedLoopAdapters> = {}) {
  const mergeCalls: Record<string, unknown>[] = [];
  const ledgerCalls: Record<string, unknown>[] = [];
  const snapshots: Record<string, unknown>[] = [];

  const base: MasonClosedLoopAdapters = {
    retrieveContext: vi.fn(async () => ({ found: true, status: "found" })),
    createPlan: vi.fn(async () => ({ summary: "plan" })),
    runExecution: vi.fn(async () => ({ ok: true })),
    runValidation: vi.fn(async () => ({ ok: true })),
    planCorrection: vi.fn(async () => ({ detail: "corr" })),
    runCorrection: vi.fn(async () => ({ ok: true })),
    createCommit: vi.fn(async () => ({ commitSha: "sha-commit" })),
    pushBranch: vi.fn(async () => ({ branch: "mason/feature" })),
    createPullRequest: vi.fn(async () => ({ prNumber: 42 })),
    readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-1" } as unknown as Record<string, unknown>)),
    decideRemediation: vi.fn(async () => ({ run: true })),
    runRemediation: vi.fn(async () => ({ ok: true })),
    hasRemediationChanges: vi.fn(async () => true),
    refreshPrHeadSha: vi.fn(async () => "head-1"),
    sleep: vi.fn(async () => undefined),
    evaluateMergeGate: vi.fn(async () => ({
      ready: true,
      expectedHeadSha: "head-1",
      actualHeadSha: "head-1",
      mergeable: true,
      reviewDecision: "approved",
      prOpen: true,
    })),
    performMerge: vi.fn(async (payload) => {
      mergeCalls.push(payload);
      return { mergedSha: "merge-sha-1", merged: true };
    }),
    writeJulius: vi.fn(async () => undefined),
    appendLedger: vi.fn(async (payload) => {
      ledgerCalls.push(payload);
    }),
    buildFinalReport: vi.fn(async ({ terminalState, states, validationAttempts, ciAttempts, ciPassed, merged, unresolvedGate }) => ({
      terminalState,
      merged,
      ciPassed,
      unresolvedGate,
      validationAttempts,
      ciAttempts,
      states: states.map((s) => s.state),
    })),
    loadSnapshot: vi.fn(async () => null),
    saveSnapshot: vi.fn(async (snapshot) => {
      snapshots.push(snapshot);
    }),
    ...overrides,
  };

  return { base, mergeCalls, ledgerCalls, snapshots };
}

describe("guarded merge + final completion artifact", () => {
  it("successful guarded merge", async () => {
    const { base } = adapters();
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("merged");
    expect(result.report.states).toContain("merge_ready");
    expect(result.report.states).toContain("merged");
  });

  it("stale head blocks merge", async () => {
    const { base } = adapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "stale_head_sha", expectedHeadSha: "head-old", actualHeadSha: "head-new", prOpen: true })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("escalated");
    expect(result.report.states).toContain("merge_blocked");
  });

  it("pending check blocks merge", async () => {
    const { base } = adapters({
      readCiStatus: vi.fn(async () => ({ status: "pending", requiredChecksPassed: false, detail: "pending", headSha: "head-1" } as unknown as Record<string, unknown>)),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("escalated");
  });

  it("failed check blocks merge", async () => {
    const { base } = adapters({
      readCiStatus: vi.fn(async () => ({ status: "failed", requiredChecksPassed: false, detail: "failed", headSha: "head-1" } as unknown as Record<string, unknown>)),
      decideRemediation: vi.fn(async () => ({ run: false, detail: "unsupported" })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("escalated");
  });

  it("requested changes blocks merge", async () => {
    const { base } = adapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "blocking_review", reviewDecision: "changes_requested", prOpen: true })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("escalated");
  });

  it("non-mergeable PR blocks merge", async () => {
    const { base } = adapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "pr_not_mergeable", mergeable: false, prOpen: true })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("escalated");
  });

  it("missing merge evidence rejects completion", async () => {
    const { base } = adapters({
      performMerge: vi.fn(async () => ({ mergedSha: "", merged: false })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("failed");
  });

  it("merge result without merge SHA rejects completion", async () => {
    const { base } = adapters({
      performMerge: vi.fn(async () => ({ mergedSha: "", merged: true })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("failed");
  });

  it("merge SHA persists to snapshot and ledger", async () => {
    const { base, snapshots, ledgerCalls } = adapters();
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("merged");
    const mergedLedger = ledgerCalls.find((entry) => entry.state === "merged");
    expect(mergedLedger).toBeTruthy();
    expect(mergedLedger.detail).toContain("merge-sha-1");
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.at(-1).irreversible.merged).toBe(true);
  });

  it("repeated invocation does not merge twice", async () => {
    const terminalSnapshot = {
      companyId: input.companyId,
      correlationId: input.correlationId,
      executionId: input.executionId,
      terminalState: "merged" as const,
      currentState: "completed" as const,
      completedStates: ["objective_received", "context_retrieved", "planning", "plan_ready", "execution_started", "validation_running", "validation_passed", "commit_created", "branch_pushed", "pull_request_created", "ci_pending", "ci_passed", "merge_ready", "merged", "completed"],
      irreversible: { commitCreated: true, branchPushed: true, pullRequestCreated: true, merged: true },
      unresolvedGate: false,
      validationAttempts: 0,
      ciAttempts: 0,
      ciPollAttempts: 2,
      ciExpectedHeadSha: "head-1",
      updatedAt: new Date().toISOString(),
    };
    const { base, mergeCalls } = adapters({ loadSnapshot: vi.fn(async () => terminalSnapshot) });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.terminalState).toBe("merged");
    expect(mergeCalls.length).toBe(0);
  });

  it("final artifact contains required identities and evidence", async () => {
    const { base } = adapters();
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.report.artifact).toBeTruthy();
    const artifact = result.report.artifact!;
    expect(artifact.companyId).toBe(input.companyId);
    expect(artifact.executionId).toBe(input.executionId);
    expect(artifact.correlationId).toBe(input.correlationId);
    expect(artifact.mergeCommitSha).toBe("merge-sha-1");
    expect(artifact.terminalState).toBe("merged");
  });

  it("final artifact reports unresolved gates truthfully", async () => {
    const { base } = adapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "blocking_review", reviewDecision: "changes_requested", prOpen: true })),
    });
    const result = await runMasonClosedLoopExecution(input, base, config);
    expect(result.report.unresolvedGate).toBe(true);
  });
});
