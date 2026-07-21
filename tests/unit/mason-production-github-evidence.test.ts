import { describe, expect, it, vi, beforeEach } from "vitest";

const runLoopMock = vi.fn();
const runGithubReadMock = vi.fn();
const vercelStatusMock = vi.fn();

function healthyVercel() {
  return {
    status: "healthy",
    evidenceTier: "github_vercel_deployment_status",
    evidenceSources: ["github_vercel_status", "github_vercel_deployment"],
    environment: "preview",
    requestedGitSha: "abc123",
    gitSha: "abc123",
    gitShaMatches: true,
    requiredChecksPassed: true,
  };
}

vi.mock("@/lib/workforce/mason-closed-loop", () => ({
  runMasonClosedLoopExecution: (...args: unknown[]) => runLoopMock(...args),
}));

vi.mock("@/lib/integrations/clients/github", () => ({
  runGithubRead: (...args: unknown[]) => runGithubReadMock(...args),
}));

vi.mock("@/lib/integrations/clients/vercel", () => ({
  getCanonicalVercelDeploymentStatus: (...args: unknown[]) => vercelStatusMock(...args),
}));

vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({
  runMasonProductionRuntime: vi.fn(async () => ({
    status: "completed",
    summary: "runtime complete",
    pullRequestUrl: "https://github.com/AIOS-HQ/aios-platform/pull/77",
    previewUrl: null,
  })),
}));

vi.mock("@/lib/julius/mason-retrieval", () => ({
  retrieveMasonExecutionContext: vi.fn(async (input: Record<string, unknown>) => ({
    status: "found",
    context: {
      company_id: input.context.company_id,
      user_id: input.context.user_id,
      actor_id: "mason",
      execution_id: input.context.execution_id,
      correlation_id: input.context.correlation_id,
      causation_id: null,
      worker_id: "mason",
      source_type: "mason_runtime",
      source_id: input.context.source_id,
      timestamp: new Date().toISOString(),
      trace: input.context.trace,
    },
    entries: [],
    degraded: false,
    error: null,
  })),
}));

vi.mock("@/lib/julius/writeback", () => ({
  writeVerifiedJuliusOutcome: vi.fn(async () => ({ status: "written", identity: "id", deduplicated: false })),
}));

function loopResult(terminalState: "merged" | "escalated" = "merged") {
  return {
    executionId: "exec-1",
    correlationId: "corr-1",
    terminalState,
    states: [],
    report: {
      terminalState,
      merged: terminalState === "merged",
      ciPassed: terminalState === "merged",
      unresolvedGate: terminalState !== "merged",
      validationAttempts: 0,
      ciAttempts: 0,
      states: [],
    },
  };
}

describe("mason production GitHub evidence binding", () => {
  beforeEach(() => {
    runLoopMock.mockReset();
    runGithubReadMock.mockReset();
    vercelStatusMock.mockReset();
    vercelStatusMock.mockResolvedValue(healthyVercel());
  });

  it("calls production GitHub evidence functions with repo context", async () => {
    runGithubReadMock
      .mockResolvedValueOnce({ ok: true, data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] } })
      .mockResolvedValueOnce({ ok: true, data: { pulls: [{ number: 77, title: "PR" }] } });

    runLoopMock.mockImplementation(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      expect(ci.status).toBe("passed");
      const gate = await adapters.evaluateMergeGate({ ...input, ci });
      expect(gate.ready).toBe(true);
      return loopResult("merged");
    });

    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
    await handleMasonEngineeringMessage({
      userId: "founder-1",
      companyId: "co-1",
      repository: "AIOS-HQ/aios-platform",
      message: "Open PR and validate required checks",
      founderApproved: true,
    });

    expect(runGithubReadMock).toHaveBeenCalled();
    expect(runGithubReadMock.mock.calls[0][1]).toBe("review_build_result");
    expect(runGithubReadMock.mock.calls[0][2]).toEqual({ repo: "AIOS-HQ/aios-platform" });
  });

  it("classifies pending/failed/passed checks and merge blocks", async () => {
    const cases = [
      {
        name: "pending checks",
        runs: [{ status: "in_progress", conclusion: null, head_sha: "abc123" }],
        expectedCi: "pending",
        gate: "required_checks_pending",
      },
      {
        name: "failed checks",
        runs: [{ status: "completed", conclusion: "failure", head_sha: "abc123" }],
        expectedCi: "failed",
        gate: "required_check_failed",
      },
      {
        name: "passed checks",
        runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }],
        expectedCi: "passed",
        gate: "merge_ready_with_required_evidence",
      },
    ] as const;

    for (const testCase of cases) {
      runGithubReadMock.mockReset();
      runGithubReadMock.mockImplementation(async (_userId, capability) => {
        if (capability === "review_build_result") {
          return { ok: true, data: { runs: testCase.runs } };
        }
        if (capability === "list_pull_requests") {
          return { ok: true, data: { pulls: [{ number: 77, title: "PR" }] } };
        }
        return { ok: false, error: `unexpected_capability:${String(capability)}` };
      });

      runLoopMock.mockImplementationOnce(async (input, adapters) => {
        const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
        expect(ci.status).toBe(testCase.expectedCi);
        if (testCase.expectedCi === "passed") {
          expect((ci as { headSha?: string | null }).headSha).toBeTruthy();
          const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: (ci as { headSha?: string | null }).headSha ?? undefined });
          expect(gate.ready).toBe(true);
          expect(gate.detail).toBe(testCase.gate);
          return loopResult("merged");
        }
        const gate = await adapters.evaluateMergeGate({ ...input, ci });
        expect(gate.ready).toBe(false);
        return loopResult("escalated");
      });

      const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
      await handleMasonEngineeringMessage({
        userId: "founder-1",
        companyId: "co-1",
        repository: "AIOS-HQ/aios-platform",
        message: `Case: ${testCase.name}`,
        founderApproved: true,
      });
    }
  });

  it("blocks stale head, requested changes, non-mergeable, and missing evidence", async () => {
    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");

    const scenarios = [
      { msg: "stale-head-sha", expected: "stale_head_sha" },
      { msg: "requested changes", expected: "blocking_review" },
      { msg: "non-mergeable", expected: "pr_not_mergeable" },
    ] as const;

    for (const s of scenarios) {
      runGithubReadMock.mockReset();
      runGithubReadMock
        .mockResolvedValueOnce({ ok: true, data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] } })
        .mockResolvedValueOnce({ ok: true, data: { pulls: [{ number: 77, title: "PR" }] } });

      runLoopMock.mockImplementationOnce(async (input, adapters) => {
        const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
        const gate = await adapters.evaluateMergeGate({ ...input, ci });
        expect(gate.ready).toBe(false);
        expect(gate.detail).toBe(s.expected);
        return loopResult("escalated");
      });

      await handleMasonEngineeringMessage({
        userId: "founder-1",
        companyId: "co-1",
        repository: "AIOS-HQ/aios-platform",
        message: s.msg,
        founderApproved: true,
      });
    }

    runGithubReadMock.mockReset();
    runGithubReadMock
      .mockResolvedValueOnce({ ok: true, data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] } })
      .mockResolvedValueOnce({ ok: true, data: { pulls: [] } });

    runLoopMock.mockImplementationOnce(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      const gate = await adapters.evaluateMergeGate({ ...input, ci });
      expect(gate.ready).toBe(false);
      expect(gate.detail).toBe("missing_required_check_evidence");
      return loopResult("escalated");
    });

    await handleMasonEngineeringMessage({
      userId: "founder-1",
      companyId: "co-1",
      repository: "AIOS-HQ/aios-platform",
      message: "missing evidence",
      founderApproved: true,
    });
  });

  it("blocks guarded merge for non-green or SHA-mismatched Vercel evidence", async () => {
    const cases = [
      { status: "pending", gitShaMatches: true, requiredChecksPassed: false, expected: "vercel_pending" },
      { status: "failed", gitShaMatches: true, requiredChecksPassed: false, expected: "vercel_failed" },
      { status: "unavailable", gitShaMatches: null, requiredChecksPassed: null, expected: "vercel_unavailable" },
      { status: "misconfigured", gitShaMatches: false, requiredChecksPassed: false, expected: "vercel_misconfigured" },
      { status: "healthy", gitShaMatches: false, requiredChecksPassed: true, expected: "vercel_git_sha_unproven" },
    ] as const;

    for (const testCase of cases) {
      runGithubReadMock.mockReset();
      runGithubReadMock
        .mockResolvedValueOnce({ ok: true, data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] } })
        .mockResolvedValueOnce({ ok: true, data: { pulls: [{ number: 77, title: "PR" }] } });
      vercelStatusMock.mockResolvedValueOnce({
        ...healthyVercel(),
        status: testCase.status,
        gitShaMatches: testCase.gitShaMatches,
        requiredChecksPassed: testCase.requiredChecksPassed,
      });
      runLoopMock.mockImplementationOnce(async (input, adapters) => {
        const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
        const gate = await adapters.evaluateMergeGate({ ...input, ci, expectedHeadSha: "abc123" });
        expect(gate.ready).toBe(false);
        expect(gate.detail).toBe(testCase.expected);
        return loopResult("escalated");
      });

      const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
      await handleMasonEngineeringMessage({
        userId: "founder-1",
        companyId: "co-1",
        repository: "AIOS-HQ/aios-platform",
        message: `Vercel gate ${testCase.status}`,
        founderApproved: true,
      });
    }
  });

  it("preserves company/execution/correlation identity in adapter path", async () => {
    runGithubReadMock
      .mockResolvedValueOnce({ ok: true, data: { runs: [{ status: "completed", conclusion: "success", head_sha: "abc123" }] } })
      .mockResolvedValueOnce({ ok: true, data: { pulls: [{ number: 77, title: "PR" }] } });

    runLoopMock.mockImplementationOnce(async (input, adapters) => {
      const ci = await adapters.readCiStatus({ ...input, attempt: 1 });
      expect(input.companyId).toBe("co-identity");
      expect(input.executionId).toBeTruthy();
      expect(input.correlationId).toBeTruthy();
      const gate = await adapters.evaluateMergeGate({ ...input, ci });
      expect(gate.ready).toBe(true);
      return loopResult("merged");
    });

    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
    await handleMasonEngineeringMessage({
      userId: "founder-1",
      companyId: "co-identity",
      repository: "AIOS-HQ/aios-platform",
      message: "identity propagation",
      founderApproved: true,
    });
  });
});
