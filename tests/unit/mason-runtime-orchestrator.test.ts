import { describe, expect, it, vi } from "vitest";

import {
  runMasonRuntimeOrchestrator,
  type MasonExecutionRequest,
  type MasonOrchestratorDependencies,
} from "@/lib/mason/runtime-orchestrator";

const baseRequest: MasonExecutionRequest = {
  requestId: "req-1",
  requestSource: "harmony",
  actor: "founder-1",
  agent: "mason",
  capability: "runtime_contract.mason",
  requiresApproval: false,
  approved: true,
};

function createDeps(overrides: Partial<MasonOrchestratorDependencies> = {}): MasonOrchestratorDependencies {
  return {
    resolveCapability: vi.fn(async () => true),
    checkRuntimeHealth: vi.fn(async () => true),
    checkConnectorHealth: vi.fn(async () => true),
    checkCredentials: vi.fn(async () => true),
    checkGovernance: vi.fn(async () => true),
    generatePlan: vi.fn(async () => ["step-1", "step-2"]),
    executePlan: vi.fn(async () => ({ ok: true })),
    captureEvidence: vi.fn(async () => ({ proof: "ok" })),
    updateLedger: vi.fn(async () => undefined),
    publishCompletion: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    now: () => new Date("2026-07-25T00:00:00.000Z"),
    createExecutionId: () => "exec-1",
    ...overrides,
  };
}

describe("mason runtime orchestrator", () => {
  it("runs a valid execution through the canonical pipeline", async () => {
    const deps = createDeps();
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);

    expect(result.context.runtimeState).toBe("COMPLETED");
    expect(result.events.map((event) => event.state)).toEqual([
      "PENDING",
      "VALIDATING",
      "READY",
      "EXECUTING",
      "CAPTURING_EVIDENCE",
      "RECORDING_LEDGER",
      "COMPLETED",
    ]);
  });

  it("moves to waiting_for_approval when Founder approval is required", async () => {
    const deps = createDeps();
    const result = await runMasonRuntimeOrchestrator(
      { ...baseRequest, requiresApproval: true, approved: false },
      deps,
    );

    expect(result.context.runtimeState).toBe("WAITING_FOR_APPROVAL");
    expect(result.events.at(-1)?.state).toBe("WAITING_FOR_APPROVAL");
  });

  it("fails when capability is missing", async () => {
    const deps = createDeps({ resolveCapability: vi.fn(async () => false) });
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);
    expect(result.context.runtimeState).toBe("FAILED");
    expect(result.events.at(-1)?.metadata?.reason).toBe("missing_capability");
  });

  it("fails when runtime is unavailable", async () => {
    const deps = createDeps({ checkRuntimeHealth: vi.fn(async () => false) });
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);
    expect(result.context.runtimeState).toBe("FAILED");
    expect(result.events.at(-1)?.metadata?.reason).toBe("runtime_unavailable");
  });

  it("fails when connector is unavailable", async () => {
    const deps = createDeps({ checkConnectorHealth: vi.fn(async () => false) });
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);
    expect(result.context.runtimeState).toBe("FAILED");
    expect(result.context.connectorState).toBe("unavailable");
    expect(result.events.at(-1)?.metadata?.reason).toBe("connector_unavailable");
  });

  it("fails when credential verification fails", async () => {
    const deps = createDeps({ checkCredentials: vi.fn(async () => false) });
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);
    expect(result.context.runtimeState).toBe("FAILED");
    expect(result.context.credentialState).toBe("invalid");
    expect(result.events.at(-1)?.metadata?.reason).toBe("credential_failure");
  });

  it("fails when governance rejects execution", async () => {
    const deps = createDeps({ checkGovernance: vi.fn(async () => false) });
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);
    expect(result.context.runtimeState).toBe("FAILED");
    expect(result.context.governanceState).toBe("rejected");
    expect(result.events.at(-1)?.metadata?.reason).toBe("governance_rejection");
  });

  it("fails execution and rolls back", async () => {
    const rollback = vi.fn(async () => undefined);
    const deps = createDeps({
      executePlan: vi.fn(async () => {
        throw new Error("execution failed");
      }),
      rollback,
    });
    const result = await runMasonRuntimeOrchestrator(baseRequest, deps);
    expect(result.context.runtimeState).toBe("ROLLED_BACK");
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(result.events.map((event) => event.state)).toContain("ROLLED_BACK");
  });
});

