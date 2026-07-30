import { describe, expect, it } from "vitest";
import {
  buildCompanyExecutionPreview,
  buildCompanyRequest,
  type CompanyBuildRequestInput,
} from "@/lib/harmony/company-builder";
import type { StorefrontViewModel } from "@/lib/marketplace/storefront";

function input(): CompanyBuildRequestInput {
  return {
    description: "Build a recurring-revenue compliance services company",
    goals: ["Recurring revenue", "Operational reliability"],
    industry: "Legal",
    servicesOrProducts: ["Compliance reviews"],
    targetCustomers: ["SMBs"],
    operationalPreferences: ["Human-in-the-loop approvals"],
  };
}

function storefront(): StorefrontViewModel {
  return {
    catalog: {},
    visibleItems: [],
    displayItems: [],
    signal: { industry: "Legal", tags: ["compliance"] },
    installedIds: new Set(),
    installCounts: {},
    recommendations: {
      workers: [{ id: "w1", name: "Compliance Worker" } as never],
      departments: [{ id: "d1", name: "Legal Department" } as never],
      skills: [],
      connectors: [{ id: "c1", name: "Drive Connector" } as never],
      dashboards: [{ id: "db1", name: "Compliance Dashboard" } as never],
      workflowPacks: [],
      bundles: [{ id: "b1", name: "Legal Bundle" } as never],
      companiesLikeYours: [{ id: "tpl1", name: "Legal Practice" } as never],
    },
    collections: [{ slug: "recommended", label: "Recommended", description: "", items: [] }],
    bundles: [{ id: "b1", name: "Legal Bundle" } as never],
    discovery: { defaultResult: [], kinds: [], tags: [] },
    companyTemplates: [],
    installedItems: [],
    availableItems: [],
    summary: {
      totalVisibleItems: 0,
      installedItems: 0,
      totalInstallCount: 0,
      recommendations: {
        workers: 1,
        departments: 1,
        skills: 0,
        connectors: 1,
        dashboards: 1,
        workflowPacks: 0,
        bundles: 1,
        companiesLikeYours: 1,
      },
      collections: 1,
      bundles: 1,
    },
  };
}

describe("company builder phase 1 orchestration", () => {
  it("creates deterministic structured request", () => {
    const first = buildCompanyRequest(input());
    const second = buildCompanyRequest(input());

    expect(second).toEqual(first);
    expect(first.industry).toBe("Legal");
    expect(first.profileSignal.tags.length).toBeGreaterThan(0);
  });

  it("builds execution preview without provisioning", () => {
    const request = buildCompanyRequest(input());
    const preview = buildCompanyExecutionPreview(request, storefront());

    expect(preview.mode).toBe("preview_only");
    expect(preview.actionRequired).toBe(true);
    expect(preview.approvalState).toBe("execution_stopped_pending_approval");
    expect(preview.recommendations.workers).toContain("Compliance Worker");
    expect(preview.recommendations.templates).toContain("Legal Practice");
    expect(preview.notes.join(" ")).toContain("no provisioning");
  });
});
