import { describe, expect, it } from "vitest";
import {
  createFounderRuntimeDashboardUnavailableViewModel,
  type FounderRuntimeDashboardMetadata,
  mapFounderRuntimeDashboardViewModel,
} from "@/lib/founder/runtime-dashboard/view-model";
import type { RuntimeProbeSummary } from "@/lib/runtime/probes/types";

const summary: RuntimeProbeSummary = {
  scope: { userId: "u1", companyId: "c1" },
  generatedAt: "2026-07-30T00:00:00.000Z",
  status: "degraded",
  probes: [],
  categories: [
    { category: "liveness", total: 2, healthy: 1, degraded: 1, failed: 0, unknown: 0, stale: 1, status: "degraded" },
    { category: "readiness", total: 1, healthy: 0, degraded: 0, failed: 0, unknown: 1, stale: 0, status: "unknown" },
  ],
};

const metadata: FounderRuntimeDashboardMetadata = {
  generatedAt: "2026-07-30T00:00:00.000Z",
  expiresAt: "2026-07-30T00:00:30.000Z",
  stale: false,
  present: true,
};

describe("founder runtime dashboard view model", () => {
  it("maps canonical runtime summary + metadata into presentation model", () => {
    const viewModel = mapFounderRuntimeDashboardViewModel(summary, metadata);

    expect(viewModel.status).toBe("degraded");
    expect(viewModel.generatedAt).toBe("2026-07-30T00:00:00.000Z");
    expect(viewModel.freshness).toBe("fresh");
    expect(viewModel.expiresAt).toBe("2026-07-30T00:00:30.000Z");
    expect(viewModel.counts).toEqual({
      total: 3,
      healthy: 1,
      degraded: 1,
      failed: 0,
      unknown: 1,
      stale: 1,
    });
    expect(viewModel.available).toBe(true);
    expect(viewModel.fallback).toBe(false);
  });

  it("preserves unknown freshness when metadata is absent", () => {
    const viewModel = mapFounderRuntimeDashboardViewModel(summary, null);
    expect(viewModel.freshness).toBe("unknown");
    expect(viewModel.expiresAt).toBeNull();
  });

  it("returns safe unavailable fallback when runtime summary is missing", () => {
    const unavailable = createFounderRuntimeDashboardUnavailableViewModel();
    expect(unavailable).toEqual({
      status: "unknown",
      generatedAt: null,
      freshness: "unknown",
      expiresAt: null,
      counts: { total: 0, healthy: 0, degraded: 0, failed: 0, unknown: 0, stale: 0 },
      categories: [],
      available: false,
      fallback: true,
    });

    expect(mapFounderRuntimeDashboardViewModel(null, metadata)).toEqual(unavailable);
  });
});
