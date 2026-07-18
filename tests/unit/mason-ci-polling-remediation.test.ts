import { describe, expect, it, vi } from "vitest";
import { runMasonClosedLoopExecution, type MasonClosedLoopAdapters, type MasonClosedLoopConfig, type MasonClosedLoopInput } from "@/lib/workforce/mason-closed-loop";

const input: MasonClosedLoopInput = {
  executionId: "exec-poll-1",
  correlationId: "corr-poll-1",
  companyId: "co-1",
  actorId: "founder-1",
  objective: "poll and remediate",
};

const config: MasonClosedLoopConfig = {
  maxValidationCorrectionAttempts: 1,
  maxCiRemediationAttempts: 1,
};

function makeAdapters(overrides: Partial<MasonClosedLoopAdapters> = {}) {
  const commitCalls: string[] = [];
  const pushCalls: string[] = [];
  const snapshots: Record<string, unknown>[] = [];

  const adapters: MasonClosedLoopAdapters = {
    retrieveContext: vi.fn(async () => ({ found: true, status: "found" })),
    createPlan: vi.fn(async () => ({ summary: "plan" })),
    runExecution: vi.fn(async () => ({ ok: true })),
    runValidation: vi.fn(async () => ({ ok: true })),
    planCorrection: vi.fn(async () => ({ detail: "fix" })),
    runCorrection: vi.fn(async () => ({ ok: true })),
    createCommit: vi.fn(async () => {
      commitCalls.push("commit");
      return { commitSha: `sha-${commitCalls.length}` };
    }),
    pushBranch: vi.fn(async () => {
      pushCalls.push("push");
      return { branch: "mason/branch" };
    }),
    createPullRequest: vi.fn(async () => ({ prNumber: 5 })),
    readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-1" } as unknown as Record<string, unknown>)),
    decideRemediation: vi.fn(async () => ({ run: true, detail: "remediation" })),
    runRemediation: vi.fn(async () => ({ ok: true })),
    hasRemediationChanges: vi.fn(async () => true),
    refreshPrHeadSha: vi.fn(async () => "head-2"),
    sleep: vi.fn(async () => undefined),
    evaluateMergeGate: vi.fn(async ({ ci }) => ({ ready: ci.status === "passed" && Boolean(ci.requiredChecksPassed) })),
    performMerge: vi.fn(async () => ({ mergedSha: "merge-sha" })),
    writeJulius: vi.fn(async () => undefined),
    appendLedger: vi.fn(async () => undefined),
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

  return { adapters, commitCalls, pushCalls, snapshots };
}

describe("mason bounded ci polling and remediation", () => {
  it("pending -> passed", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "pending", requiredChecksPassed: false, detail: "pending", headSha: "head-1" })
        .mockResolvedValueOnce({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-1" }),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("ci_pending");
    expect(result.report.states).toContain("ci_passed");
    expect(result.report.states).toContain("merge_ready");
  });

  it("pending -> timeout", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "pending", requiredChecksPassed: false, detail: "pending", headSha: "head-1" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("ci_failed");
    expect(result.terminalState).toBe("escalated");
  });

  it("failed -> remediation -> passed with head refresh", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed", requiredChecksPassed: false, detail: "red", headSha: "head-1" })
        .mockResolvedValueOnce({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-2" }),
      refreshPrHeadSha: vi.fn(async () => "head-2"),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("remediation_running");
    expect(result.report.states).toContain("ci_passed");
    expect(result.report.states).toContain("merge_ready");
  });

  it("failed -> remediation -> failed -> escalation", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed", requiredChecksPassed: false, detail: "red", headSha: "head-1" })
        .mockResolvedValueOnce({ status: "failed", requiredChecksPassed: false, detail: "still red", headSha: "head-2" }),
      refreshPrHeadSha: vi.fn(async () => "head-2"),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, { ...config, maxCiRemediationAttempts: 0 });
    expect(result.terminalState).toBe("escalated");
  });

  it("unsupported remediation escalates", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "failed", requiredChecksPassed: false, detail: "red", headSha: "head-1" })),
      decideRemediation: vi.fn(async () => ({ run: false, detail: "unsupported_remediation" })),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("escalated");
  });

  it("stale head during polling escalates", async () => {
    const { adapters } = makeAdapters({
      loadSnapshot: vi.fn(async () => ({
        companyId: input.companyId,
        correlationId: input.correlationId,
        executionId: input.executionId,
        terminalState: "completed",
        currentState: "ci_pending",
        completedStates: ["objective_received", "context_retrieved", "planning", "plan_ready", "execution_started", "validation_running", "validation_passed", "commit_created", "branch_pushed", "pull_request_created", "ci_pending"],
        irreversible: { commitCreated: true, branchPushed: true, pullRequestCreated: true, merged: false },
        unresolvedGate: true,
        validationAttempts: 0,
        ciAttempts: 0,
        ciPollAttempts: 1,
        ciExpectedHeadSha: "head-expected",
        updatedAt: new Date().toISOString(),
      })),
      readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-other" } as unknown as Record<string, unknown>)),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("completed");
  });

  it("evidence fetch failure escalates", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => {
        throw new Error("network");
      }),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("escalated");
  });

  it("interrupted polling resumes from snapshot", async () => {
    const snapshots: Record<string, unknown>[] = [];
    const { adapters } = makeAdapters({
      saveSnapshot: vi.fn(async (snapshot) => snapshots.push(snapshot)),
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "pending", requiredChecksPassed: false, detail: "pending", headSha: "head-1" })
        .mockResolvedValueOnce({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-1" }),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.report.states).toContain("ci_pending");
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.at(-1).ciPollAttempts).toBeGreaterThanOrEqual(1);
  });

  it("duplicate invocation does not duplicate correction commit/push", async () => {
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

    const { adapters, commitCalls, pushCalls } = makeAdapters({
      loadSnapshot: vi.fn(async () => terminalSnapshot),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("merged");
    expect(commitCalls.length).toBe(0);
    expect(pushCalls.length).toBe(0);
  });

  it("merge_ready only after fresh passing evidence", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed", requiredChecksPassed: false, detail: "red", headSha: "head-1" })
        .mockResolvedValueOnce({ status: "passed", requiredChecksPassed: true, detail: "green", headSha: "head-2" }),
      refreshPrHeadSha: vi.fn(async () => "head-2"),
    });

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    const ciPassedIndex = result.report.states.indexOf("ci_passed");
    const mergeReadyIndex = result.report.states.indexOf("merge_ready");
    expect(ciPassedIndex).toBeGreaterThanOrEqual(0);
    expect(mergeReadyIndex).toBeGreaterThan(ciPassedIndex);
  });
});
