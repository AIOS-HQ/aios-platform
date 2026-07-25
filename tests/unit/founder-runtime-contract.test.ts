import { describe, expect, it } from "vitest";
import {
  createFounderRuntimeStatusEnvelope,
  toFounderOperationalRequest,
  validateFounderOperationalRequest,
} from "@/lib/founder-runtime-contract";

describe("founder runtime contract", () => {
  it("converts valid inputs into canonical request", () => {
    const req = toFounderOperationalRequest({
      requestId: "req-1",
      correlationId: "corr-1",
      founderId: "founder-1",
      source: "harmony_operator",
      intent: "engineering_task",
      requestedAction: "open_pull_request",
      targetAgent: "mason",
      capabilityId: "runtime_contract.mason",
      payload: { repository: "AIOS-HQ/aios-platform" },
      approvalRequirement: true,
      submittedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(req).toMatchObject({
      requestId: "req-1",
      correlationId: "corr-1",
      founderId: "founder-1",
      source: "harmony_operator",
      intent: "engineering_task",
      requestedAction: "open_pull_request",
      targetAgent: "mason",
      capabilityId: "runtime_contract.mason",
      approvalRequirement: "required",
    });
    expect(validateFounderOperationalRequest(req)).toEqual({ ok: true });
  });

  it("fails closed for missing requestId", () => {
    const req = toFounderOperationalRequest({
      requestId: "",
      correlationId: "corr-1",
      founderId: "founder-1",
      capabilityId: "runtime_contract.mason",
    });
    expect(validateFounderOperationalRequest(req)).toEqual({ ok: false, error: "missing_request_id" });
  });

  it("fails closed for missing founderId", () => {
    const req = toFounderOperationalRequest({
      requestId: "req-1",
      correlationId: "corr-1",
      founderId: "",
      capabilityId: "runtime_contract.mason",
    });
    expect(validateFounderOperationalRequest(req)).toEqual({ ok: false, error: "missing_founder_id" });
  });

  it("fails closed for missing capabilityId", () => {
    const req = toFounderOperationalRequest({
      requestId: "req-1",
      correlationId: "corr-1",
      founderId: "founder-1",
      capabilityId: "",
    });
    expect(validateFounderOperationalRequest(req)).toEqual({ ok: false, error: "missing_capability_id" });
  });

  it("preserves correlationId", () => {
    const req = toFounderOperationalRequest({
      requestId: "req-1",
      correlationId: "corr-preserved",
      founderId: "founder-1",
      capabilityId: "runtime_contract.mason",
    });
    expect(req.correlationId).toBe("corr-preserved");
  });

  it("maps approval requirement from boolean and string", () => {
    const fromBoolean = toFounderOperationalRequest({
      requestId: "req-1",
      correlationId: "corr-1",
      founderId: "founder-1",
      capabilityId: "runtime_contract.mason",
      approvalRequirement: true,
    });
    const fromString = toFounderOperationalRequest({
      requestId: "req-2",
      correlationId: "corr-2",
      founderId: "founder-1",
      capabilityId: "runtime_contract.mason",
      approvalRequirement: "required",
    });
    const notRequired = toFounderOperationalRequest({
      requestId: "req-3",
      correlationId: "corr-3",
      founderId: "founder-1",
      capabilityId: "runtime_contract.mason",
      approvalRequirement: false,
    });

    expect(fromBoolean.approvalRequirement).toBe("required");
    expect(fromString.approvalRequirement).toBe("required");
    expect(notRequired.approvalRequirement).toBe("not_required");
  });

  it("creates shared status envelope shape", () => {
    const status = createFounderRuntimeStatusEnvelope({
      executionId: "exec-1",
      requestId: "req-1",
      correlationId: "corr-1",
      state: "executing",
      approvalState: "approved",
      governanceState: "allowed",
      runtimeState: "healthy",
      evidenceStatus: "pending",
      ledgerStatus: "pending",
      blockerReason: null,
      requiredNextAction: "wait_for_evidence",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(status).toEqual({
      executionId: "exec-1",
      requestId: "req-1",
      correlationId: "corr-1",
      state: "executing",
      approvalState: "approved",
      governanceState: "allowed",
      runtimeState: "healthy",
      evidenceStatus: "pending",
      ledgerStatus: "pending",
      blockerReason: null,
      requiredNextAction: "wait_for_evidence",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("remains import-safe for neutral shared use", async () => {
    const mod = await import("@/lib/founder-runtime-contract");
    expect(typeof mod.toFounderOperationalRequest).toBe("function");
    expect(typeof mod.validateFounderOperationalRequest).toBe("function");
    expect(typeof mod.createFounderRuntimeStatusEnvelope).toBe("function");
  });
});
