import { describe, expect, it, vi } from "vitest";
import type { ProbeScope } from "@/lib/runtime/probes/types";

const getRuntimeHealth = vi.fn();
const getRuntimeSummary = vi.fn();
const getRuntimeCategory = vi.fn();
const getRuntimeProbe = vi.fn();
const listRuntimeProbes = vi.fn();

vi.mock("@/lib/runtime/probes/service", () => ({
  runtimeProbeService: {
    getRuntimeHealth,
    getRuntimeSummary,
    getRuntimeCategory,
    getRuntimeProbe,
    listRuntimeProbes,
  },
}));

const scope: ProbeScope = { userId: "u1", companyId: "c1" };

describe("runtime health orchestrator", () => {
  it("delegates getHealth", async () => {
    getRuntimeHealth.mockResolvedValueOnce("degraded");
    const { runtimeHealthOrchestrator } = await import("@/lib/runtime/health-orchestrator");
    await expect(runtimeHealthOrchestrator.getHealth(scope)).resolves.toBe("degraded");
    expect(getRuntimeHealth).toHaveBeenCalledWith(scope);
  });

  it("delegates getSummary", async () => {
    getRuntimeSummary.mockResolvedValueOnce({ status: "healthy", probes: [], categories: [], scope, generatedAt: "2026-07-29T00:00:00.000Z" });
    const { runtimeHealthOrchestrator } = await import("@/lib/runtime/health-orchestrator");
    await expect(runtimeHealthOrchestrator.getSummary(scope)).resolves.toMatchObject({ status: "healthy", scope });
    expect(getRuntimeSummary).toHaveBeenCalledWith(scope);
  });

  it("delegates getCategory", async () => {
    getRuntimeCategory.mockResolvedValueOnce({ category: "readiness", status: "unknown", total: 0, healthy: 0, degraded: 0, failed: 0, unknown: 0, stale: 0 });
    const { runtimeHealthOrchestrator } = await import("@/lib/runtime/health-orchestrator");
    await expect(runtimeHealthOrchestrator.getCategory(scope, "readiness")).resolves.toMatchObject({ category: "readiness" });
    expect(getRuntimeCategory).toHaveBeenCalledWith(scope, "readiness");
  });

  it("delegates getProbe", async () => {
    getRuntimeProbe.mockResolvedValueOnce(null);
    const { runtimeHealthOrchestrator } = await import("@/lib/runtime/health-orchestrator");
    await expect(runtimeHealthOrchestrator.getProbe(scope, "probe:missing")).resolves.toBeNull();
    expect(getRuntimeProbe).toHaveBeenCalledWith(scope, "probe:missing");
  });

  it("delegates listProbes", async () => {
    listRuntimeProbes.mockResolvedValueOnce([{ probeId: "p1", source: "diagnostics", category: "readiness", status: "healthy", summary: "ok", observedAt: "2026-07-29T00:00:00.000Z", freshness: "fresh", scope, unavailable: false, evidence: [] }]);
    const { runtimeHealthOrchestrator } = await import("@/lib/runtime/health-orchestrator");
    await expect(runtimeHealthOrchestrator.listProbes(scope)).resolves.toHaveLength(1);
    expect(listRuntimeProbes).toHaveBeenCalledWith(scope);
  });

  it("exposes read-only orchestrator methods", async () => {
    const { createRuntimeHealthOrchestrator } = await import("@/lib/runtime/health-orchestrator");
    const orchestrator = createRuntimeHealthOrchestrator();
    expect(Object.keys(orchestrator).sort()).toEqual([
      "getCategory",
      "getHealth",
      "getProbe",
      "getSummary",
      "listProbes",
    ]);
  });
});
