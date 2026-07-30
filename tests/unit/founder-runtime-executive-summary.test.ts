import { describe, expect, it } from "vitest";
import { composeRuntimeExecutiveSummary } from "@/lib/founder/runtime-dashboard/executive-summary";
import {
  createFounderRuntimeDashboardUnavailableViewModel,
  mapFounderRuntimeDashboardViewModel,
  type FounderRuntimeDashboardMetadata,
} from "@/lib/founder/runtime-dashboard/view-model";
import type { RuntimeProbeSummary } from "@/lib/runtime/probes/types";

const metadata: FounderRuntimeDashboardMetadata = {
  generatedAt: "2026-07-30T00:00:00.000Z",
  expiresAt: "2026-07-30T00:00:30.000Z",
  stale: false,
  present: true,
};

function makeSummary(status: RuntimeProbeSummary["status"], overrides?: Partial<RuntimeProbeSummary>): RuntimeProbeSummary {
  return {
    scope: { userId: "u-1", companyId: "c-1" },
    generatedAt: "2026-07-30T00:00:00.000Z",
    status,
    probes: [],
    categories: [
      {
        category: "liveness",
        total: 2,
        healthy: status === "healthy" ? 2 : 1,
        degraded: status === "degraded" ? 1 : 0,
        failed: status === "failed" ? 1 : 0,
        unknown: 0,
        stale: 0,
        status,
      },
    ],
    ...overrides,
  };
}

describe("founder runtime executive summary", () => {
  it("returns unknown summary when runtime view model is unavailable", () => {
    const unavailable = createFounderRuntimeDashboardUnavailableViewModel();
    const summary = composeRuntimeExecutiveSummary(unavailable);

    expect(summary.severity).toBe("unknown");
    expect(summary.headline).toContain("unavailable");
    expect(summary.details[0]).toContain("could not be retrieved");
  });

  it("returns critical summary when failed probes are present", () => {
    const viewModel = mapFounderRuntimeDashboardViewModel(makeSummary("failed"), metadata);
    const summary = composeRuntimeExecutiveSummary(viewModel);

    expect(summary.severity).toBe("critical");
    expect(summary.headline).toContain("attention required");
    expect(summary.details.join(" ")).toContain("failed probe");
  });

  it("returns attention summary for degraded or stale runtime", () => {
    const degradedVm = mapFounderRuntimeDashboardViewModel(makeSummary("degraded"), metadata);
    const degradedSummary = composeRuntimeExecutiveSummary(degradedVm);
    expect(degradedSummary.severity).toBe("attention");

    const staleMetadata: FounderRuntimeDashboardMetadata = { ...metadata, stale: true };
    const healthyVm = mapFounderRuntimeDashboardViewModel(makeSummary("healthy"), staleMetadata);
    const staleSummary = composeRuntimeExecutiveSummary(healthyVm);
    expect(staleSummary.severity).toBe("attention");
    expect(staleSummary.details.join(" ")).toContain("stale");
  });

  it("returns healthy summary for healthy runtime", () => {
    const viewModel = mapFounderRuntimeDashboardViewModel(makeSummary("healthy"), metadata);
    const summary = composeRuntimeExecutiveSummary(viewModel);

    expect(summary.severity).toBe("healthy");
    expect(summary.headline).toContain("stable");
    expect(summary.details.join(" ")).toContain("healthy probe");
  });
});
