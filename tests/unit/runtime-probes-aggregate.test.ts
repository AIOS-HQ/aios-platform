import { describe, expect, it } from "vitest";
import {
  getRuntimeProbeSummary,
  listRuntimeProbes,
  summarizeRuntimeProbes,
  type RuntimeProbeAdapters,
} from "@/lib/runtime/probes/aggregate";
import type { ProbeScope, RuntimeProbeResult } from "@/lib/runtime/probes/types";

const scope: ProbeScope = { userId: "u1", companyId: "c1" };

function probe(overrides: Partial<RuntimeProbeResult>): RuntimeProbeResult {
  return {
    probeId: "id",
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

function adaptersWith(values: Partial<Record<keyof RuntimeProbeAdapters, RuntimeProbeResult | Error>>): RuntimeProbeAdapters {
  const make = (key: keyof RuntimeProbeAdapters, fallback: RuntimeProbeResult) => async () => {
    const v = values[key] ?? fallback;
    if (v instanceof Error) throw v;
    return v;
  };

  return {
    runtimeExecutionProbe: make("runtimeExecutionProbe", probe({ probeId: "a", source: "runtime_execution", category: "execution_health" })),
    connectorHealthProbe: make("connectorHealthProbe", probe({ probeId: "b", source: "connector_health", category: "connector_health" })),
    diagnosticsProbe: make("diagnosticsProbe", probe({ probeId: "c", source: "diagnostics", category: "readiness" })),
    activityProbe: make("activityProbe", probe({ probeId: "d", source: "agent_activity", category: "operational_activity" })),
    workforceSignalsProbe: make("workforceSignalsProbe", probe({ probeId: "e", source: "workforce_signals", category: "liveness" })),
  };
}

describe("runtime probe aggregation", () => {
  it("composes all five adapters into one deterministic probe list", async () => {
    const probes = await listRuntimeProbes(scope, adaptersWith({}));
    expect(probes).toHaveLength(5);
    expect(probes.map((p) => p.source)).toEqual([
      "workforce_signals",
      "diagnostics",
      "runtime_execution",
      "connector_health",
      "agent_activity",
    ].sort((a, b) => {
      const order = ["liveness", "readiness", "execution_health", "connector_health", "operational_activity", "freshness"];
      const catBySource: Record<string, string> = {
        workforce_signals: "liveness",
        diagnostics: "readiness",
        runtime_execution: "execution_health",
        connector_health: "connector_health",
        agent_activity: "operational_activity",
      };
      return order.indexOf(catBySource[a] ?? "freshness") - order.indexOf(catBySource[b] ?? "freshness");
    }));
  });

  it("computes category counts and empty categories as unknown", () => {
    const summary = summarizeRuntimeProbes([
      probe({ category: "execution_health", status: "failed" }),
      probe({ category: "connector_health", status: "degraded", freshness: "stale" }),
    ], scope, "2026-07-29T10:00:00.000Z");

    const execution = summary.categories.find((c) => c.category === "execution_health");
    const connector = summary.categories.find((c) => c.category === "connector_health");
    const readiness = summary.categories.find((c) => c.category === "readiness");

    expect(execution).toMatchObject({ total: 1, failed: 1, status: "failed" });
    expect(connector).toMatchObject({ total: 1, degraded: 1, stale: 1, status: "degraded" });
    expect(readiness).toMatchObject({ total: 0, healthy: 0, degraded: 0, failed: 0, unknown: 0, stale: 0, status: "unknown" });
  });

  it("applies overall status precedence failed > degraded > healthy > unknown", () => {
    const failed = summarizeRuntimeProbes([probe({ status: "failed" })], scope).status;
    const degraded = summarizeRuntimeProbes([probe({ status: "degraded" })], scope).status;
    const healthy = summarizeRuntimeProbes([probe({ status: "healthy" })], scope).status;
    const unknown = summarizeRuntimeProbes([], scope).status;

    expect(failed).toBe("failed");
    expect(degraded).toBe("degraded");
    expect(healthy).toBe("healthy");
    expect(unknown).toBe("unknown");
  });

  it("preserves unavailable unknown probes and never upgrades them", () => {
    const summary = summarizeRuntimeProbes([
      probe({ category: "liveness", status: "unknown", unavailable: true, observedAt: null, freshness: "unknown" }),
    ], scope);
    const live = summary.categories.find((c) => c.category === "liveness");
    expect(live?.status).toBe("unknown");
    expect(summary.status).toBe("unknown");
  });

  it("keeps stale healthy domain status while counting stale", () => {
    const summary = summarizeRuntimeProbes([
      probe({ category: "connector_health", status: "healthy", freshness: "stale" }),
    ], scope);
    const category = summary.categories.find((c) => c.category === "connector_health");
    expect(category).toMatchObject({ healthy: 1, stale: 1, status: "healthy" });
  });

  it("preserves requested scope and deterministic generatedAt", async () => {
    const generatedAt = "2026-07-29T12:00:00.000Z";
    const summary = summarizeRuntimeProbes([probe({})], scope, generatedAt);
    expect(summary.scope).toEqual(scope);
    expect(summary.generatedAt).toBe(generatedAt);

    const live = await getRuntimeProbeSummary(scope, adaptersWith({}));
    expect(live.scope).toEqual(scope);
    expect(() => new Date(live.generatedAt).toISOString()).not.toThrow();
  });

  it("handles adapter failures explicitly as unavailable unknown probes", async () => {
    const probes = await listRuntimeProbes(
      scope,
      adaptersWith({ diagnosticsProbe: new Error("boom") }),
    );

    const diagnostics = probes.find((p) => p.source === "diagnostics");
    expect(diagnostics).toBeTruthy();
    expect(diagnostics).toMatchObject({
      category: "readiness",
      status: "unknown",
      unavailable: true,
      observedAt: null,
      freshness: "unknown",
    });
    expect(diagnostics?.reason).toContain("boom");
  });

  it("returns all canonical categories in deterministic order", () => {
    const summary = summarizeRuntimeProbes([], scope);
    expect(summary.categories.map((c) => c.category)).toEqual([
      "liveness",
      "readiness",
      "execution_health",
      "connector_health",
      "operational_activity",
      "freshness",
    ]);
  });
});
