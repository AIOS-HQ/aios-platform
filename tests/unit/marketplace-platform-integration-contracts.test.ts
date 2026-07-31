import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCompanyExecutionPreview, buildCompanyRequest } from "@/lib/harmony/company-builder";
import type { StorefrontViewModel } from "@/lib/marketplace/storefront";

const buildPage = readFileSync("src/app/(app)/harmony/build/page.tsx", "utf8");
const companyBuilderComponent = readFileSync("src/components/company-builder/company-builder.tsx", "utf8");
const marketplaceStorefront = readFileSync("src/lib/marketplace/storefront.ts", "utf8");
const marketplaceActions = readFileSync("src/lib/marketplace/actions.ts", "utf8");
const runtimeContracts = readFileSync("src/lib/workforce/runtime-contracts.ts", "utf8");

function storefrontFixture(): StorefrontViewModel {
  return {
    catalog: {},
    visibleItems: [],
    displayItems: [],
    signal: { industry: "SaaS", tags: ["growth"] },
    installedIds: new Set(["worker-1"]),
    installCounts: { "worker-1": 10 },
    recommendations: {
      workers: [{ id: "worker-1", name: "Growth Worker" } as never],
      departments: [{ id: "dept-1", name: "Revenue Department" } as never],
      skills: [{ id: "skill-1", name: "Prospecting Skill" } as never],
      connectors: [{ id: "conn-1", name: "HubSpot" } as never],
      dashboards: [{ id: "dash-1", name: "Revenue Dashboard" } as never],
      workflowPacks: [{ id: "wf-1", name: "Outbound Workflow" } as never],
      bundles: [{ id: "bundle-1", name: "SaaS Bundle" } as never],
      companiesLikeYours: [{ id: "tpl-1", name: "SaaS Template" } as never],
    },
    collections: [{ slug: "ai-recommended", label: "AI Recommended", description: "", items: [] }],
    bundles: [{ id: "bundle-1", name: "SaaS Bundle" } as never],
    discovery: {
      defaultResult: [
        {
          item: { id: "worker-1", name: "Growth Worker" } as never,
          score: 9,
          matched: ["growth"],
        },
      ],
      kinds: ["workforce"],
      tags: ["growth"],
    },
    companyTemplates: [{ id: "tpl-1", name: "SaaS Template" } as never],
    installedItems: [{ id: "worker-1", name: "Growth Worker" } as never],
    availableItems: [{ id: "skill-1", name: "Prospecting Skill" } as never],
    summary: {
      totalVisibleItems: 2,
      installedItems: 1,
      totalInstallCount: 10,
      recommendations: {
        workers: 1,
        departments: 1,
        skills: 1,
        connectors: 1,
        dashboards: 1,
        workflowPacks: 1,
        bundles: 1,
        companiesLikeYours: 1,
      },
      collections: 1,
      bundles: 1,
    },
  };
}

describe("marketplace platform integration contracts", () => {
  it("keeps Company Builder wired to shared StorefrontViewModel", () => {
    expect(buildPage).toContain("loadStorefrontViewModel");
    expect(buildPage).toContain("CompanyBuilder");
    expect(companyBuilderComponent).toContain("storefront: StorefrontViewModel");
    expect(companyBuilderComponent).toContain("buildCompanyExecutionPreview");
  });

  it("keeps execution preview in preview-only approval-gated mode", () => {
    const request = buildCompanyRequest({
      description: "Build a growth-focused SaaS company",
      goals: ["Recurring revenue"],
      industry: "SaaS",
      servicesOrProducts: ["Subscription software"],
      targetCustomers: ["SMBs"],
      operationalPreferences: ["Human-in-the-loop approvals"],
    });

    const preview = buildCompanyExecutionPreview(request, storefrontFixture());

    expect(preview.mode).toBe("preview_only");
    expect(preview.actionRequired).toBe(true);
    expect(preview.approvalState).toBe("execution_stopped_pending_approval");
    expect(preview.recommendations.workers).toContain("Growth Worker");
    expect(preview.recommendations.bundles).toContain("SaaS Bundle");
    expect(preview.notes.some((note) => note.includes("no provisioning"))).toBe(true);
    expect(preview.notes.some((note) => note.includes("Execution requires explicit approval"))).toBe(true);
  });

  it("keeps installation handoff and persistence in marketplace action boundary", () => {
    expect(marketplaceActions).toContain("planInstall");
    expect(marketplaceActions).toContain("planUpdate");
    expect(marketplaceActions).toContain("planRollback");
    expect(marketplaceActions).toContain("planUninstall");
    expect(marketplaceActions).toContain("if (plan.blocked) return { plan, applied: false }");
    expect(marketplaceActions).toContain("company_installations");
  });

  it("keeps storefront integration contracts for installed-state and company context", () => {
    expect(marketplaceStorefront).toContain("loadInstallState");
    expect(marketplaceStorefront).toContain("loadGlobalInstallCounts");
    expect(marketplaceStorefront).toContain("getEnvelope(companyId)");
    expect(marketplaceStorefront).toContain("installedIds");
    expect(marketplaceStorefront).toContain("installedItems");
    expect(marketplaceStorefront).toContain("availableItems");
  });

  it("keeps workforce/runtime contracts aligned with approval-gated execution", () => {
    expect(runtimeContracts).toContain("approvalPolicy");
    expect(runtimeContracts).toContain("guided_runtime");
    expect(runtimeContracts).toContain("real_runtime");
    expect(runtimeContracts).toContain("Approval Center");
  });
});
