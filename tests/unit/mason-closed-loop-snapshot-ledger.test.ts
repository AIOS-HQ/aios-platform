import { describe, expect, it, vi } from "vitest";
import { runMasonClosedLoopExecution, type MasonClosedLoopAdapters, type MasonClosedLoopConfig, type MasonClosedLoopInput } from "@/lib/workforce/mason-closed-loop";

const input: MasonClosedLoopInput = {
  executionId: "exec-snapshot-1",
  correlationId: "corr-snapshot-1",
  companyId: "co-1",
  actorId: "founder-1",
  objective: "closed loop",
};

const config: MasonClosedLoopConfig = {
  maxValidationCorrectionAttempts: 1,
  maxCiRemediationAttempts: 1,
};

function makeAdapters(state: { snapshots: Record<string, unknown>[]; failLedger?: boolean; snapshot?: Record<string, unknown> }) {
  const irreversible = { commit: 0, push: 0, pr: 0, merge: 0 };
  const ledgerEvents: Record<string, unknown>[] = [];

  const adapters: MasonClosedLoopAdapters = {
    retrieveContext: vi.fn(async () => ({ found: true, status: "found" })),
    createPlan: vi.fn(async () => ({ summary: "plan" })),
    runExecution: vi.fn(async () => ({ ok: true })),
    runValidation: vi.fn(async () => ({ ok: true })),
    planCorrection: vi.fn(async () => ({ detail: "correction" })),
    runCorrection: vi.fn(async () => ({ ok: true })),
    createCommit: vi.fn(async () => {
      irreversible.commit += 1;
      return { commitSha: "sha" };
    }),
    pushBranch: vi.fn(async () => {
      irreversible.push += 1;
      return { branch: "mason/branch" };
    }),
    createPullRequest: vi.fn(async () => {
      irreversible.pr += 1;
      return { prNumber: 12 };
    }),
    readCiStatus: vi.fn(async () => ({ status: "passed", requiredChecksPassed: true })),
    decideRemediation: vi.fn(async () => ({ run: true })),
    runRemediation: vi.fn(async () => ({ ok: true })),
    evaluateMergeGate: vi.fn(async () => ({ ready: true })),
    performMerge: vi.fn(async () => {
      irreversible.merge += 1;
      return { mergedSha: "merged-sha" };
    }),
    writeJulius: vi.fn(async () => undefined),
    appendLedger: vi.fn(async (payload) => {
      ledgerEvents.push(payload);
      if (state.failLedger && payload.state === "merge_ready") {
        throw new Error("ledger_append_failed");
      }
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
    loadSnapshot: vi.fn(async () => state.snapshot ?? null),
    saveSnapshot: vi.fn(async (snapshot) => {
      state.snapshots.push(snapshot);
    }),
  };

  return { adapters, irreversible, ledgerEvents };
}

describe("mason closed-loop durable snapshot + ledger", () => {
  it("saves snapshots after transitions", async () => {
    const state = { snapshots: [] as unknown as Record<string, unknown>[] };
    const { adapters } = makeAdapters(state);

    await runMasonClosedLoopExecution(input, adapters, config);
    expect(state.snapshots.length).toBeGreaterThan(0);
    const latest = state.snapshots.at(-1);
    expect(latest.executionId).toBe(input.executionId);
    expect(latest.companyId).toBe(input.companyId);
    expect(latest.correlationId).toBe(input.correlationId);
    expect(Array.isArray(latest.completedStates)).toBe(true);
  });

  it("restores terminal snapshot and avoids irreversible repeats", async () => {
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
      updatedAt: new Date().toISOString(),
    };
    const state = { snapshots: [] as unknown as Record<string, unknown>[], snapshot: terminalSnapshot };
    const { adapters, irreversible } = makeAdapters(state);

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("merged");
    expect(irreversible.commit).toBe(0);
    expect(irreversible.push).toBe(0);
    expect(irreversible.pr).toBe(0);
    expect(irreversible.merge).toBe(0);
  });

  it("ledger events preserve identity and ledger failure is truthful", async () => {
    const state = { snapshots: [] as unknown as Record<string, unknown>[], failLedger: true };
    const { adapters, ledgerEvents } = makeAdapters(state);

    await expect(runMasonClosedLoopExecution(input, adapters, config)).rejects.toThrow("ledger_append_failed");

    expect(ledgerEvents.length).toBeGreaterThan(0);
    for (const e of ledgerEvents) {
      expect(e.executionId).toBe(input.executionId);
      expect(e.correlationId).toBe(input.correlationId);
      expect(e.companyId).toBe(input.companyId);
    }
  });

  it("reconstructs terminal report from durable snapshot", async () => {
    const snapshot = {
      companyId: input.companyId,
      correlationId: input.correlationId,
      executionId: input.executionId,
      terminalState: "escalated" as const,
      currentState: "completed" as const,
      completedStates: ["objective_received", "context_retrieved", "planning", "plan_ready", "execution_started", "validation_running", "validation_failed", "escalated", "completed"],
      irreversible: { commitCreated: false, branchPushed: false, pullRequestCreated: false, merged: false },
      unresolvedGate: true,
      validationAttempts: 1,
      ciAttempts: 0,
      updatedAt: new Date().toISOString(),
    };
    const state = { snapshots: [] as unknown as Record<string, unknown>[], snapshot };
    const { adapters } = makeAdapters(state);

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("escalated");
    expect(result.report.terminalState).toBe("escalated");
    expect(result.report.unresolvedGate).toBe(true);
  });

  it("persists failed terminal truth instead of collapsing completion snapshots", async () => {
    const state = { snapshots: [] as unknown as Record<string, unknown>[] };
    const { adapters } = makeAdapters(state);
    adapters.runExecution = vi.fn(async () => ({
      status: "failed",
      summary: "production runtime failed",
      pullRequestUrl: null,
      previewUrl: null,
      executionId: input.executionId,
      branch: null,
      commitSha: null,
      pullRequestNumber: null,
      validationMode: "external_ci",
    }));

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("failed");
    expect(state.snapshots.at(-1)).toMatchObject({
      terminalState: "failed",
      currentState: "completed",
    });
  });

  it("preserves approval-pending truth without running validation or mutation adapters", async () => {
    const state = { snapshots: [] as unknown as Record<string, unknown>[] };
    const { adapters } = makeAdapters(state);
    adapters.runExecution = vi.fn(async () => ({
      status: "blocked",
      summary: "Awaiting Founder approval. Approval ID: approval-1.",
      pullRequestUrl: null,
      previewUrl: null,
      executionId: input.executionId,
      branch: null,
      commitSha: null,
      pullRequestNumber: null,
      validationMode: "external_ci",
    }));

    const result = await runMasonClosedLoopExecution(input, adapters, config);
    expect(result.terminalState).toBe("awaiting_founder_approval");
    expect(result.states.map((state) => state.state)).toContain("approval_pending");
    expect(adapters.runValidation).not.toHaveBeenCalled();
    expect(adapters.createCommit).not.toHaveBeenCalled();
    expect(state.snapshots.at(-1)).toMatchObject({ terminalState: "awaiting_founder_approval" });
  });
});
