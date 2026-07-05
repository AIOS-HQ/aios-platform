import { describe, expect, it } from "vitest";
import {
  buildOrganizationView,
  orgChartTiers,
  type AgentSummaryLike,
  type OrgMessageInput,
} from "@/lib/workforce/org-view";

const T0 = "2026-07-05T00:00:00.000Z";
const T1 = "2026-07-05T01:00:00.000Z";
const T2 = "2026-07-05T02:00:00.000Z";
const T3 = "2026-07-05T03:00:00.000Z";

const summary: Record<string, AgentSummaryLike> = {
  atlas: { currentObjective: { title: "Curate Julius", progress: 50 }, activeObjectives: 3, queuedWork: 3, openRecommendations: 1 },
  auditor: { currentObjective: null, activeObjectives: 0, queuedWork: 0, openRecommendations: 0 },
};

const messages: OrgMessageInput[] = [
  { from_agent: "harmony", to_agent: "atlas", status: "delegated", risk: "routine", subject: "Delegate research", created_at: T3 },
  { from_agent: "harmony", to_agent: "atlas", status: "awaiting_approval", risk: "approval", subject: "Approve publish", created_at: T2 },
  { from_agent: "atlas", to_agent: "harmony", status: "completed", risk: "routine", subject: "Research done", created_at: T0 },
  { from_agent: "auditor", to_agent: "aegis", status: "blocked", risk: "routine", subject: "Audit blocked", created_at: T1 },
  { from_agent: "mason", to_agent: "atlas", status: "open", risk: "routine", subject: "Founder-only", created_at: T1 },
];

describe("buildOrganizationView", () => {
  const view = buildOrganizationView({ summary, messages });

  it("excludes founder-only Mason and roots the tree at the founder", () => {
    expect(view.workers.some((w) => w.key === "mason")).toBe(false);
    expect(view.workers.length).toBe(9);
    expect(view.founderKey).toBe("founder");
    expect(view.workers.find((w) => w.key === "harmony")?.reportsTo).toBe("founder");
    expect(view.workers.find((w) => w.key === "atlas")?.reportsTo).toBe("harmony");
  });

  it("computes capacity + overloaded health from objectives + queued + in-flight", () => {
    const atlas = view.workers.find((w) => w.key === "atlas")!;
    expect(atlas.activeTasks).toBe(2); // delegated + awaiting_approval are in-flight
    expect(atlas.pendingApprovals).toBe(1);
    expect(atlas.capacity.load).toBe(8); // 3 + 3 + 2
    expect(atlas.capacity.utilizationPct).toBe(160);
    expect(atlas.health).toBe("overloaded");
    expect(atlas.currentObjective?.title).toBe("Curate Julius");
  });

  it("flags a blocked recipient as needing attention, and idle when unloaded", () => {
    const aegis = view.workers.find((w) => w.key === "aegis")!;
    expect(aegis.blocked).toBe(1);
    expect(aegis.health).toBe("attention");
    const auditor = view.workers.find((w) => w.key === "auditor")!;
    expect(auditor.health).toBe("idle");
  });

  it("aggregates communication flow (worker↔worker only), sorted by volume", () => {
    // mason→atlas is excluded (mason is not a subscriber-facing worker).
    expect(view.commEdges.some((e) => e.from === "mason")).toBe(false);
    const top = view.commEdges[0];
    expect(top.from).toBe("harmony");
    expect(top.to).toBe("atlas");
    expect(top.count).toBe(2);
    expect(top.approvals).toBe(1);
  });

  it("builds a newest-first timeline and correct totals", () => {
    expect(view.timeline[0].at).toBe(T3);
    expect(view.timeline.map((e) => e.at)).toEqual([T3, T2, T1, T0]);
    expect(view.totals.workers).toBe(9);
    expect(view.totals.activeTasks).toBe(2);
    expect(view.totals.pendingApprovals).toBe(1);
    expect(view.totals.blocked).toBe(1);
    expect(view.totals.overloaded).toBe(1);
  });

  it("splits Harmony from the specialists for the org chart", () => {
    const { harmony, specialists } = orgChartTiers(view);
    expect(harmony?.key).toBe("harmony");
    expect(specialists.some((w) => w.key === "harmony")).toBe(false);
    expect(specialists.length).toBe(8);
  });
});
