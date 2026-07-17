import { describe, expect, it, vi } from "vitest";
import {
  assertLegalTransition,
  runMasonClosedLoopExecution,
  type MasonClosedLoopAdapters,
  type MasonClosedLoopConfig,
  type MasonClosedLoopInput,
} from "@/lib/workforce/mason-closed-loop";

function baseInput(): MasonClosedLoopInput {
  return {
    executionId: "exec-1",
    correlationId: "corr-1",
    companyId: "co-1",
    actorId: "founder-1",
    objective: "Fix lint and open PR",
  };
}

function makeAdapters(overrides: Partial<MasonClosedLoopAdapters> = {}) {
  const irreversibleCounts = { commit: 0, push: 0, pr: 0, merge: 0 };

  const adapters: MasonClosedLoopAdapters = {
    retrieveContext: vi.fn(async () => ({ found: true, status: "found" })),
    createPlan: vi.fn(async () => ({ summary: "plan" })),
    runExecution: vi.fn(async () => ({ ok: true })),
    runValidation: vi.fn(async () => ({ ok: true })),
    planCorrection: vi.fn(async () => ({ detail: "correction-plan" })),
    runCorrection: vi.fn(async () => ({ ok: true })),
    createCommit: vi.fn(async () => {
      irreversibleCounts.commit += 1;
      return { commitSha: "sha1" };
    }),
    pushBranch: vi.fn(async () => {
      irreversibleCounts.push += 1;
      return { branch: "mason/exec-1" };
    }),
    createPullRequest: vi.fn(async () => {
      irreversibleCounts.pr += 1;
      return { prNumber: 101 };
    }),
    readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: true })),
    decideRemediation: vi.fn(async () => ({ run: true, detail: "remediate" })),
    runRemediation: vi.fn(async () => ({ ok: true })),
    evaluateMergeGate: vi.fn(async () => ({ ready: true })),
    performMerge: vi.fn(async () => {
      irreversibleCounts.merge += 1;
      return { mergedSha: "merge-sha" };
    }),
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
    saveSnapshot: vi.fn(async () => undefined),
    ...overrides,
  };

  return { adapters, irreversibleCounts };
}

const config: MasonClosedLoopConfig = {
  maxValidationCorrectionAttempts: 2,
  maxCiRemediationAttempts: 2,
};

describe("mason closed loop coordinator", () => {
  it("runs successful state sequence", async () => {
    const { adapters } = makeAdapters();
    const result = await runMasonClosedLoopExecution(baseInput(), adapters, config);

    expect(result.terminalState).toBe("merged");
    expect(result.report.merged).toBe(true);
    expect(result.report.ciPassed).toBe(true);
    expect(result.report.states).toContain("objective_received");
    expect(result.report.states).toContain("merged");
    expect(result.report.states.at(-1)).toBe("completed");
  });

  it("rejects invalid transition", () => {
    expect(() => assertLegalTransition("objective_received", "merged")).toThrow("invalid_transition");
  });

  it("retrieves Julius context before planning", async () => {
    const order: string[] = [];
    const { adapters } = makeAdapters({
      retrieveContext: vi.fn(async () => {
        order.push("context");
        return { found: true, status: "found" };
      }),
      createPlan: vi.fn(async () => {
        order.push("plan");
        return { summary: "plan" };
      }),
    });

    await runMasonClosedLoopExecution(baseInput(), adapters, config);
    expect(order).toEqual(["context", "plan"]);
  });

  it("validation failure enters correction then succeeds", async () => {
    const { adapters } = makeAdapters();
    const runValidation = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, detail: "lint" })
      .mockResolvedValueOnce({ ok: true, detail: "clean" });
    adapters.runValidation = runValidation;

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, config);
    expect(result.report.validationAttempts).toBe(1);
    expect(result.report.states).toContain("validation_failed");
    expect(result.report.states).toContain("correction_planned");
    expect(result.report.states).toContain("correction_running");
    expect(result.terminalState).toBe("merged");
  });

  it("validation retry exhaustion escalates", async () => {
    const { adapters } = makeAdapters({
      runValidation: vi.fn(async () => ({ ok: false, detail: "still failing" })),
    });

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, { ...config, maxValidationCorrectionAttempts: 0 });
    expect(result.terminalState).toBe("escalated");
    expect(result.report.states).toContain("validation_failed");
    expect(result.report.states).toContain("escalated");
  });

  it("ci failure enters remediation and retry exhaustion escalates", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "failed", requiredChecksPassed: false, detail: "ci-red" })),
    });

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, { ...config, maxCiRemediationAttempts: 0 });
    expect(result.terminalState).toBe("escalated");
    expect(result.report.states).toContain("ci_failed");
    expect(result.report.states).toContain("escalated");
  });

  it("merge blocked while CI pending", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi.fn(async () => ({ status: "pending", requiredChecksPassed: false })),
    });

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, config);
    expect(result.terminalState).toBe("escalated");
    expect(result.report.states).toContain("merge_blocked");
  });

  it("merge allowed only after required checks pass", async () => {
    const { adapters } = makeAdapters({
      readCiStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "failed", requiredChecksPassed: false })
        .mockResolvedValueOnce({ status: "passed", requiredChecksPassed: true }),
    });

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, config);
    expect(result.terminalState).toBe("merged");
    expect(result.report.ciPassed).toBe(true);
    expect(result.report.states).toContain("remediation_running");
  });

  it("duplicate invocation avoids repeating irreversible operations", async () => {
    const terminalSnapshot = {
      executionId: "exec-1",
      terminalState: "merged" as const,
      completedStates: ["objective_received", "context_retrieved", "planning", "plan_ready", "execution_started", "validation_running", "validation_passed", "commit_created", "branch_pushed", "pull_request_created", "ci_pending", "ci_passed", "merge_ready", "merged", "completed"] as const,
      irreversible: {
        commitCreated: true,
        branchPushed: true,
        pullRequestCreated: true,
        merged: true,
      },
      validationAttempts: 0,
      ciAttempts: 0,
    };

    const { adapters, irreversibleCounts } = makeAdapters({
      loadSnapshot: vi.fn(async () => terminalSnapshot),
    });

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, config);
    expect(result.terminalState).toBe("merged");
    expect(irreversibleCounts.commit).toBe(0);
    expect(irreversibleCounts.push).toBe(0);
    expect(irreversibleCounts.pr).toBe(0);
    expect(irreversibleCounts.merge).toBe(0);
  });

  it("final report reflects terminal truth and ledger gets execution/correlation ids", async () => {
    const appendLedger = vi.fn(async () => undefined);
    const { adapters } = makeAdapters({ appendLedger });

    const result = await runMasonClosedLoopExecution(baseInput(), adapters, config);
    expect(result.report.terminalState).toBe("merged");
    expect(result.report.unresolvedGate).toBe(false);
    expect(result.report.merged).toBe(true);
    expect(result.report.ciPassed).toBe(true);

    for (const call of appendLedger.mock.calls) {
      const payload = call[0];
      expect(payload.executionId).toBe("exec-1");
      expect(payload.correlationId).toBe("corr-1");
    }
  });
});
