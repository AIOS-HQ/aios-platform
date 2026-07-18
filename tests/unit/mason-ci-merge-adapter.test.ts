import { describe, expect, it, vi } from "vitest";
import { runMasonClosedLoopExecution, type MasonClosedLoopAdapters, type MasonClosedLoopConfig, type MasonClosedLoopInput } from "@/lib/workforce/mason-closed-loop";

const input: MasonClosedLoopInput = {
  executionId: "exec-ci-1",
  correlationId: "corr-ci-1",
  companyId: "co-1",
  actorId: "founder-1",
  objective: "implement ci evidence",
};

const config: MasonClosedLoopConfig = {
  maxValidationCorrectionAttempts: 1,
  maxCiRemediationAttempts: 1,
};

function makeAdapters(overrides: Partial<MasonClosedLoopAdapters> = {}) {
  const ledger: Array<{ state: string; detail?: string; executionId: string; correlationId: string; companyId: string }> = [];
  const snapshots: Record<string, unknown>[] = [];

  const adapters: MasonClosedLoopAdapters = {
    retrieveContext: vi.fn(async () => ({ found: true, status: "found" })),
    createPlan: vi.fn(async () => ({ summary: "plan" })),
    runExecution: vi.fn(async () => ({ ok: true })),
    runValidation: vi.fn(async () => ({ ok: true })),
    planCorrection: vi.fn(async () => ({ detail: "validation-fix" })),
    runCorrection: vi.fn(async () => ({ ok: true })),
    createCommit: vi.fn(async () => ({ commitSha: "sha-1" })),
    pushBranch: vi.fn(async () => ({ branch: "mason/ci" })),
    createPullRequest: vi.fn(async () => ({ prNumber: 77 })),
    readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: true, detail: "all checks green" })),
    decideRemediation: vi.fn(async () => ({ run: true, detail: "run remediation" })),
    runRemediation: vi.fn(async () => ({ ok: true })),
    evaluateMergeGate: vi.fn(async () => ({ ready: true })),
    performMerge: vi.fn(async () => ({ mergedSha: "merge-sha-1" })),
    writeJulius: vi.fn(async () => undefined),
    appendLedger: vi.fn(async ({ state, detail, executionId, correlationId, companyId }) => {
      ledger.push({ state, detail, executionId, correlationId, companyId });
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
    saveSnapshot: vi.fn(async (s) => {
      snapshots.push(s);
    }),
    ...overrides,
  };

  return { adapters, ledger, snapshots };
}

describe("mason ci/merge evidence adapters", () => {
  it("pending CI keeps ci_pending and blocks merge", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "pending", requiredChecksPassed: false, detail: "checks pending" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("ci_pending");
    expect(result.report.states).toContain("merge_blocked");
    expect(result.terminalState).toBe("escalated");
  });

  it("failed CI enters remediation path", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed", requiredChecksPassed: false, detail: "unit test red" })
        .mockResolvedValueOnce({ status: "passed", requiredChecksPassed: true, detail: "green after fix" }),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("ci_failed");
    expect(result.report.states).toContain("remediation_running");
    expect(result.report.states).toContain("ci_passed");
    expect(result.report.states).toContain("merge_ready");
    expect(result.terminalState).toBe("merged");
  });

  it("stale head sha blocks merge", async () => {
    const { adapters } = makeAdapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "stale_head_sha" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("merge_blocked");
    expect(result.terminalState).toBe("escalated");
  });

  it("missing required checks evidence blocks merge", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: false, detail: "missing required checks" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("merge_blocked");
    expect(result.terminalState).toBe("escalated");
  });

  it("blocking review blocks merge", async () => {
    const { adapters } = makeAdapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "blocking_review" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("merge_blocked");
    expect(result.terminalState).toBe("escalated");
  });

  it("non-mergeable pull request blocks merge", async () => {
    const { adapters } = makeAdapters({
      evaluateMergeGate: vi.fn(async () => ({ ready: false, detail: "pr_not_mergeable" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("merge_blocked");
    expect(result.terminalState).toBe("escalated");
  });

  it("retry exhaustion escalates", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "failed", requiredChecksPassed: false, detail: "still failing" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, { ...config, maxCiRemediationAttempts: 0 });
    expect(result.terminalState).toBe("escalated");
    expect(result.report.states).toContain("escalated");
  });

  it("durable snapshot and ledger record CI + merge evidence", async () => {
    const { adapters, snapshots, ledger } = makeAdapters();
    await runMasonClosedLoopExecution(input, adapters, config);

    expect(snapshots.length).toBeGreaterThan(0);
    const latest = snapshots.at(-1);
    expect(latest.completedStates).toContain("ci_passed");
    expect(latest.completedStates).toContain("merge_ready");
    expect(latest.completedStates).toContain("merged");

    const gateEntries = ledger.filter((entry) => ["ci_pending", "ci_passed", "merge_ready", "merged", "merge_blocked"].includes(entry.state));
    expect(gateEntries.length).toBeGreaterThan(0);
    for (const entry of gateEntries) {
      expect(entry.executionId).toBe(input.executionId);
      expect(entry.correlationId).toBe(input.correlationId);
      expect(entry.companyId).toBe(input.companyId);
    }
  });
});
