import { describe, expect, it } from "vitest";
import { composeRuntimeExecutiveIntelligence, composeRuntimeExecutiveSummary } from "@/lib/founder/runtime-dashboard/executive-summary";
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

describe("founder runtime executive intelligence", () => {
  it("returns all required intelligence sections in deterministic order", () => {
    const viewModel = mapFounderRuntimeDashboardViewModel(makeSummary("healthy"), metadata);
    const intelligence = composeRuntimeExecutiveIntelligence(viewModel);

    expect(intelligence.sections.map((section) => section.title)).toEqual([
      "Executive Highlights",
      "Top Risks",
      "Emerging Trends",
      "Operational Wins",
      "Founder Attention Queue",
    ]);
  });

  it("derives degraded runtime intelligence without fabricated claims", () => {
    const degraded = mapFounderRuntimeDashboardViewModel(makeSummary("degraded"), metadata);
    const intelligence = composeRuntimeExecutiveIntelligence(degraded);

    const risks = intelligence.sections.find((section) => section.title === "Top Risks")?.insights.join(" ") ?? "";
    const queue = intelligence.sections.find((section) => section.title === "Founder Attention Queue")?.insights.join(" ") ?? "";

    expect(risks).toContain("degraded probe");
    expect(queue).toContain("Investigate degraded probes");
  });

  it("handles unavailable runtime with explicit insufficient evidence", () => {
    const unavailable = createFounderRuntimeDashboardUnavailableViewModel();
    const intelligence = composeRuntimeExecutiveIntelligence(unavailable);

    const highlights = intelligence.sections.find((section) => section.title === "Executive Highlights")?.insights.join(" ") ?? "";
    const trends = intelligence.sections.find((section) => section.title === "Emerging Trends")?.insights.join(" ") ?? "";

    expect(highlights).toContain("Insufficient runtime evidence");
    expect(trends).toContain("Insufficient runtime evidence");
  });

  it("flags stale runtime evidence and stale-focused attention", () => {
    const staleViewModel = mapFounderRuntimeDashboardViewModel(makeSummary("healthy"), { ...metadata, stale: true });
    const intelligence = composeRuntimeExecutiveIntelligence(staleViewModel);

    const risks = intelligence.sections.find((section) => section.title === "Top Risks")?.insights.join(" ") ?? "";
    const queue = intelligence.sections.find((section) => section.title === "Founder Attention Queue")?.insights.join(" ") ?? "";

    expect(risks).toContain("stale");
    expect(queue).toContain("Refresh stale runtime snapshot");
  });

  it("handles empty runtime summaries with explicit insufficient evidence", () => {
    const empty = mapFounderRuntimeDashboardViewModel(
      {
        scope: { userId: "u-1", companyId: "c-1" },
        generatedAt: "2026-07-30T00:00:00.000Z",
        status: "healthy",
        probes: [],
        categories: [],
      },
      metadata,
    );
    const intelligence = composeRuntimeExecutiveIntelligence(empty);

    expect(intelligence.sections[0]?.insights.join(" ")).toContain("Insufficient runtime evidence");
  });

  it("handles partial runtime with unknown probes explicitly", () => {
    const partial = mapFounderRuntimeDashboardViewModel(
      {
        scope: { userId: "u-1", companyId: "c-1" },
        generatedAt: "2026-07-30T00:00:00.000Z",
        status: "degraded",
        probes: [],
        categories: [
          {
            category: "readiness",
            total: 2,
            healthy: 1,
            degraded: 0,
            failed: 0,
            unknown: 1,
            stale: 0,
            status: "unknown",
          },
        ],
      },
      metadata,
    );
    const intelligence = composeRuntimeExecutiveIntelligence(partial);
    const trends = intelligence.sections.find((section) => section.title === "Emerging Trends")?.insights.join(" ") ?? "";

    expect(trends).toContain("Unknown probe outcomes");
  });

  it("is deterministic, side-effect free, and does not mutate input", () => {
    const baseline = mapFounderRuntimeDashboardViewModel(makeSummary("degraded"), metadata);
    const frozenInput = Object.freeze({
      ...baseline,
      counts: Object.freeze({ ...baseline.counts }),
      categories: Object.freeze(baseline.categories.map((category) => Object.freeze({ ...category }))),
    });

    const first = composeRuntimeExecutiveIntelligence(frozenInput);
    const second = composeRuntimeExecutiveIntelligence(frozenInput);

    expect(second).toEqual(first);
    expect(frozenInput.counts.degraded).toBe(baseline.counts.degraded);
    expect(frozenInput.categories).toHaveLength(baseline.categories.length);
  });
});
