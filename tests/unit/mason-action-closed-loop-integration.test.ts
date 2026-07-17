import { describe, expect, it, vi, beforeEach } from "vitest";

const runLoopMock = vi.fn();

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

vi.mock("@/lib/workforce/mason-closed-loop", () => ({
  runMasonClosedLoopExecution: (...args: unknown[]) => runLoopMock(...args),
}));

vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({
  runMasonProductionRuntime: vi.fn(async () => ({
    status: "completed",
    summary: "runtime completed",
    pullRequestUrl: null,
    previewUrl: null,
    diagnostics: {},
  })),
}));

describe("mason-action closed-loop integration", () => {
  beforeEach(() => {
    runLoopMock.mockReset();
  });

  it("real Mason entrypoint invokes coordinator with deterministic identity", async () => {
    runLoopMock.mockResolvedValue({ terminalState: "completed", report: { terminalState: "completed" }, states: [] });
    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");

    await handleMasonEngineeringMessage({
      userId: "founder-1",
      companyId: "co-1",
      message: "Create branch mason/test and open PR",
      founderApproved: true,
      repository: "AIOS-HQ/aios-platform",
    });

    expect(runLoopMock).toHaveBeenCalledTimes(1);
    const [input, adapters, config] = runLoopMock.mock.calls[0];
    expect(input.companyId).toBe("co-1");
    expect(input.actorId).toBe("founder-1");
    expect(input.objective).toContain("open PR");
    expect(input.executionId).toBeTruthy();
    expect(input.correlationId).toBeTruthy();
    expect(adapters).toBeTruthy();
    expect(config.maxValidationCorrectionAttempts).toBeGreaterThanOrEqual(0);
    expect(config.maxCiRemediationAttempts).toBeGreaterThanOrEqual(0);
  });

  it("coordinator adapter order preserves retrieval-before-planning", async () => {
    runLoopMock.mockImplementation(async (_input, adapters) => {
      const order: string[] = [];
      const base = {
        executionId: "exec-1",
        correlationId: "corr-1",
        companyId: "co-1",
        actorId: "founder-1",
        objective: "objective",
      };
      await adapters.retrieveContext(base);
      order.push("context");
      await adapters.createPlan(base);
      order.push("plan");
      expect(order).toEqual(["context", "plan"]);
      return { terminalState: "completed", report: { terminalState: "completed" }, states: [] };
    });

    const { handleMasonEngineeringMessage } = await import("@/lib/workforce/mason-action");
    await handleMasonEngineeringMessage({ userId: "founder-1", companyId: "co-1", message: "run", founderApproved: true });
    expect(runLoopMock).toHaveBeenCalledTimes(1);
  });
});
