import { describe, expect, it } from "vitest";
import { createRuntimeConsumerService } from "@/lib/runtime/probes/service";
import type { ProbeScope, RuntimeProbeResult } from "@/lib/runtime/probes/types";

import { vi } from "vitest";

vi.mock("@/lib/runtime/probes/auth", () => ({
  authorizeProbeScope: vi.fn(async (scope) => scope),
  sanitizeProbe: vi.fn((p) => p),
  sanitizeProbeReason: vi.fn((r) => r),
  ProbeAuthorizationError: class extends Error {
    code: "unauthorized" | "forbidden";
    constructor(code: "unauthorized" | "forbidden", message: string) {
      super(message);
      this.code = code;
      this.name = "ProbeAuthorizationError";
    }
  },
}));

const scope: ProbeScope = { userId: "u1", companyId: "c1" };

function probe(overrides: Partial<RuntimeProbeResult>): RuntimeProbeResult {
  return {
    probeId: "probe:1",
    source: "runtime_execution",
    category: "execution_health",
    status: "healthy",
    summary: "ok",
    observedAt: "2026-07-29T00:00:00.000Z",
    freshness: "fresh",
    scope,
    unavailable: false,
    evidence: [],
    ...overrides,
  };
}

function makeAdapters(rows: RuntimeProbeResult[]) {
  return {
    runtimeExecutionProbe: async () => rows[0] ?? probe({ probeId: "runtime:1" }),
    connectorHealthProbe: async () => rows[1] ?? probe({ probeId: "connector:1", source: "connector_health", category: "connector_health" }),
    diagnosticsProbe: async () => rows[2] ?? probe({ probeId: "diag:1", source: "diagnostics", category: "readiness" }),
    activityProbe: async () => rows[3] ?? probe({ probeId: "activity:1", source: "agent_activity", category: "operational_activity" }),
    workforceSignalsProbe: async () => rows[4] ?? probe({ probeId: "workforce:1", source: "workforce_signals", category: "liveness" }),
  };
}

describe("runtime probe consumer contract", () => {
  it("delegates list and summary methods to existing aggregation path", async () => {
    const service = createRuntimeConsumerService(makeAdapters([]));
    const probes = await service.listRuntimeProbes(scope);
    const summary = await service.getRuntimeSummary(scope);

    expect(probes.length).toBe(5);
    expect(summary.probes.length).toBe(5);
    expect(summary.scope).toEqual(scope);
  });

  it("returns deterministic health status", async () => {
    const service = createRuntimeConsumerService(
      makeAdapters([probe({ status: "failed", probeId: "runtime:failed" })]),
    );
    await expect(service.getRuntimeHealth(scope)).resolves.toBe("failed");
  });

  it("supports category filtering", async () => {
    const service = createRuntimeConsumerService(makeAdapters([]));
    const category = await service.getRuntimeCategory(scope, "freshness");
    expect(category).toMatchObject({ category: "freshness", status: "unknown" });
  });

  it("supports probe lookup and unknown probe behavior", async () => {
    const rows = [probe({ probeId: "runtime:exact" })];
    const service = createRuntimeConsumerService(makeAdapters(rows));

    await expect(service.getRuntimeProbe(scope, "runtime:exact")).resolves.toBeTruthy();
    await expect(service.getRuntimeProbe(scope, "nope")).resolves.toBeNull();
  });

  it("preserves sanitized output from underlying aggregation", async () => {
    const service = createRuntimeConsumerService(
      makeAdapters([probe({ summary: "Probe produced a restricted summary.", reason: "Probe source failed with a restricted error payload.", evidence: [{ source: "runtime_execution", ref: "[redacted]", observedAt: "2026-07-29T00:00:00.000Z" }] })]),
    );
    const probes = await service.listRuntimeProbes(scope);
    const target = probes.find((p) => p.source === "runtime_execution");
    expect(target?.summary).toBe("Probe produced a restricted summary.");
    expect(target?.reason).toBe("Probe source failed with a restricted error payload.");
    expect(target?.evidence[0]?.ref).toBe("[redacted]");
  });

  it("exposes read-only methods only", () => {
    const service = createRuntimeConsumerService(makeAdapters([]));
    expect(Object.keys(service).sort()).toEqual([
      "getRuntimeCategory",
      "getRuntimeHealth",
      "getRuntimeProbe",
      "getRuntimeSummary",
      "listRuntimeProbes",
    ]);
  });
});
