import { describe, expect, it } from "vitest";
import {
  PROBE_CATEGORIES,
  PROBE_FRESHNESS_STATES,
  PROBE_SOURCES,
  PROBE_STATUSES,
  compareProbeStatusPrecedence,
  createRuntimeProbeResult,
  isProbeCategory,
  isProbeFreshness,
  isProbeSource,
  isProbeStatus,
} from "@/lib/runtime/probes/types";

describe("runtime probe contract types", () => {
  it("represents all canonical categories", () => {
    expect(PROBE_CATEGORIES).toEqual([
      "liveness",
      "readiness",
      "execution_health",
      "connector_health",
      "operational_activity",
      "freshness",
    ]);
    for (const category of PROBE_CATEGORIES) expect(isProbeCategory(category)).toBe(true);
  });

  it("represents all canonical statuses", () => {
    expect(PROBE_STATUSES).toEqual(["healthy", "degraded", "failed", "unknown"]);
    for (const status of PROBE_STATUSES) expect(isProbeStatus(status)).toBe(true);
  });

  it("represents all freshness states", () => {
    expect(PROBE_FRESHNESS_STATES).toEqual(["fresh", "stale", "unknown"]);
    for (const freshness of PROBE_FRESHNESS_STATES) expect(isProbeFreshness(freshness)).toBe(true);
  });

  it("represents all canonical sources", () => {
    expect(PROBE_SOURCES).toEqual([
      "runtime_execution",
      "connector_health",
      "diagnostics",
      "agent_activity",
      "workforce_signals",
    ]);
    for (const source of PROBE_SOURCES) expect(isProbeSource(source)).toBe(true);
  });

  it("enforces status precedence", () => {
    expect(compareProbeStatusPrecedence("failed", "degraded")).toBeGreaterThan(0);
    expect(compareProbeStatusPrecedence("degraded", "healthy")).toBeGreaterThan(0);
    expect(compareProbeStatusPrecedence("healthy", "unknown")).toBeGreaterThan(0);
  });

  it("prevents unavailable data from being represented as healthy", () => {
    expect(() =>
      createRuntimeProbeResult({
        probeId: "probe-1",
        source: "diagnostics",
        category: "readiness",
        status: "healthy",
        summary: "No data",
        observedAt: null,
        freshness: "unknown",
        scope: { userId: "u1", companyId: null },
        unavailable: true,
        evidence: [],
      }),
    ).toThrow("Unavailable probe results must use status 'unknown'");
  });

  it("requires unknown freshness when unavailable and no observation timestamp exists", () => {
    expect(() =>
      createRuntimeProbeResult({
        probeId: "probe-2",
        source: "agent_activity",
        category: "operational_activity",
        status: "unknown",
        summary: "No activity records",
        observedAt: null,
        freshness: "fresh",
        scope: { userId: "u1", companyId: "c1" },
        unavailable: true,
        evidence: [],
      }),
    ).toThrow("Unavailable probe results with no observation must use freshness 'unknown'");
  });

  it("permits stale but healthy data without forcing degraded status", () => {
    const result = createRuntimeProbeResult({
      probeId: "probe-3",
      source: "connector_health",
      category: "connector_health",
      status: "healthy",
      summary: "Last snapshot is stale but healthy",
      observedAt: "2026-07-01T00:00:00.000Z",
      freshness: "stale",
      scope: { userId: "u1", companyId: "c1" },
      unavailable: false,
      evidence: [{ source: "connector_health", ref: "health:github", observedAt: "2026-07-01T00:00:00.000Z" }],
    });

    expect(result.status).toBe("healthy");
    expect(result.freshness).toBe("stale");
  });

  it("keeps evidence references to safe fields only", () => {
    const result = createRuntimeProbeResult({
      probeId: "probe-4",
      source: "runtime_execution",
      category: "execution_health",
      status: "degraded",
      summary: "Execution errors increased",
      observedAt: "2026-07-28T12:00:00.000Z",
      freshness: "fresh",
      scope: { userId: "u1", companyId: "c1" },
      unavailable: false,
      evidence: [{ source: "runtime_execution", ref: "capability:github:list_prs", observedAt: "2026-07-28T12:00:00.000Z" }],
    });

    expect(result.evidence).toHaveLength(1);
    expect(Object.keys(result.evidence[0] ?? {})).toEqual(["source", "ref", "observedAt"]);
  });
});
