import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  retrievalStatus: "found" as "found" | "empty" | "degraded" | "failed",
  retrievalError: "retrieval failed",
  retrievalEntries: [{ id: "j1" }],
  runtimeCalls: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/julius/mason-retrieval", () => ({
  retrieveMasonExecutionContext: vi.fn(async () => {
    if (state.retrievalStatus === "failed") {
      return {
        status: "failed" as const,
        context: {
          company_id: "company-1",
          user_id: "user-1",
          actor_id: "mason",
          execution_id: "exec-1",
          correlation_id: "corr-1",
          worker_id: "mason",
          source_type: "mason_runtime",
          source_id: "source",
          timestamp: new Date().toISOString(),
          trace: {},
        },
        entries: [],
        degraded: false,
        error: state.retrievalError,
      };
    }
    if (state.retrievalStatus === "degraded") {
      return {
        status: "degraded" as const,
        context: {
          company_id: "company-1",
          user_id: "user-1",
          actor_id: "mason",
          execution_id: "exec-1",
          correlation_id: "corr-1",
          worker_id: "mason",
          source_type: "mason_runtime",
          source_id: "source",
          timestamp: new Date().toISOString(),
          trace: {},
        },
        entries: [],
        degraded: true,
        error: "degraded",
      };
    }
    return {
      status: state.retrievalStatus,
      context: {
        company_id: "company-1",
        user_id: "user-1",
        actor_id: "mason",
        execution_id: "exec-1",
        correlation_id: "corr-1",
        worker_id: "mason",
        source_type: "mason_runtime",
        source_id: "source",
        timestamp: new Date().toISOString(),
        trace: {},
      },
      entries: state.retrievalEntries,
      degraded: false,
    };
  }),
}));

vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({
  runMasonProductionRuntime: vi.fn(async (input) => {
    state.runtimeCalls.push(input as Record<string, unknown>);
    return {
      status: "completed" as const,
      summary: "runtime ok",
      pullRequestUrl: null,
      previewUrl: null,
      branch: "mason/branch",
      branchCreated: true,
      commitCreated: false,
      pullRequestCreated: false,
      issueCreated: false,
      issueNumber: null,
      issueUrl: null,
      requestedBaseBranch: "main",
      requestedBranchName: "mason/branch",
      explicitBranchRequest: false,
      explicitPullRequestRequest: false,
      shouldOpenPullRequest: false,
      diagnostics: {},
    };
  }),
}));

vi.mock("@/lib/julius/writeback", () => ({
  writeVerifiedJuliusOutcome: vi.fn(async () => ({
    status: "written" as const,
    logicalIdentity: "mock-logical-identity",
    entryId: "entry-1",
  })),
}));
vi.mock("@/lib/workforce/mason-learning", () => ({
  recordMasonEngineeringLearning: vi.fn(async () => ({ julius: { status: "written" }, companySkill: null })),
}));
vi.mock("@/lib/workforce/mason-closed-loop", () => ({
  runMasonClosedLoopExecution: vi.fn(async (input, adapters) => {
    await adapters.runExecution({ ...input, plan: { summary: "grounded" } });
    return { terminalState: "completed", states: [], report: { terminalState: "completed" } };
  }),
}));

describe("Mason action Julius retrieval integration", () => {
  beforeEach(() => {
    state.retrievalStatus = "found";
    state.retrievalError = "retrieval failed";
    state.retrievalEntries = [{ id: "j1" }];
    state.runtimeCalls = [];
  });

  it("runs retrieval before runtime and enriches summary when retrieval found", async () => {
    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
    const result = await handleMasonEngineeringMessage({
      userId: "user-1",
      companyId: "company-1",
      message: "Implement API hardening",
      founderApproved: true,
      requesterAuthorization: { role: "admin", verified: true, source: "server_session" },
    });

    expect(state.runtimeCalls).toHaveLength(1);
    expect(result.summary).toContain("Julius retrieval: found");
  });

  it("continues on degraded retrieval (no fabricated context)", async () => {
    state.retrievalStatus = "degraded";

    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
    const result = await handleMasonEngineeringMessage({
      userId: "user-1",
      companyId: "company-1",
      message: "Implement API hardening",
      founderApproved: true,
      requesterAuthorization: { role: "admin", verified: true, source: "server_session" },
    });

    expect(state.runtimeCalls).toHaveLength(1);
    expect(result.summary).toContain("Julius retrieval: degraded");
  });

  it("blocks before runtime on failed retrieval", async () => {
    state.retrievalStatus = "failed";
    state.retrievalError = "permission denied";

    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
    const result = await handleMasonEngineeringMessage({
      userId: "user-1",
      companyId: "company-1",
      message: "Implement API hardening",
      founderApproved: true,
      requesterAuthorization: { role: "admin", verified: true, source: "server_session" },
    });

    expect(state.runtimeCalls).toHaveLength(0);
    expect(result.status).toBe("blocked");
    expect(result.summary).toContain("Julius retrieval failed before Mason planning");
  });
});
