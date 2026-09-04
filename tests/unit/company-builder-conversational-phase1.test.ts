import { describe, expect, it } from "vitest";
import {
  buildCompanyExecutionPreview,
  buildCompanyRequest,
  type CompanyBuildRequestInput,
} from "@/lib/harmony/company-builder";
import type { StorefrontViewModel } from "@/lib/marketplace/storefront";

function input(): CompanyBuildRequestInput {
  return {
    description: "Build a strategy-led operations consultancy with recurring retainers",
    goals: ["Recurring revenue", "Operational reliability"],
    industry: "Professional Services",
    servicesOrProducts: ["Advisory", "Implementation"],
    targetCustomers: ["SMB operators"],
    operationalPreferences: ["Executive approvals", "Service quality controls"],
  };
}

function storefront(): StorefrontViewModel {
  return {
    catalog: {},
    visibleItems: [],
    displayItems: [],
    signal: { industry: "Professional Services", tags: ["operations"] },
    installedIds: new Set(),
    installCounts: {},
    recommendations: {
      workers: [{ id: "w1", name: "Operations Strategist" } as never],
      departments: [{ id: "d1", name: "Advisory Department" } as never],
      skills: [],
      connectors: [{ id: "c1", name: "CRM Connector" } as never],
      dashboards: [{ id: "db1", name: "Executive Dashboard" } as never],
      workflowPacks: [],
      bundles: [{ id: "b1", name: "Strategy Bundle" } as never],
      companiesLikeYours: [{ id: "tpl1", name: "Consulting Template" } as never],
    },
    collections: [{ slug: "recommended", label: "Recommended", description: "", items: [] }],
    bundles: [{ id: "b1", name: "Strategy Bundle" } as never],
    discovery: {
      defaultResult: [{ item: { id: "m1", name: "Workflow Accelerator" } as never, score: 9.2, matched: ["workflow"] }],
      kinds: [],
      tags: [],
    },
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

describe("company builder conversational phase 1", () => {
  it("produces executive briefing with understanding and phases", () => {
    const request = buildCompanyRequest(input());
    const preview = buildCompanyExecutionPreview(request, storefront());

    expect(preview.executiveBriefing.understanding.toLowerCase()).toContain("industry focus");
    expect(preview.executiveBriefing.executionPhases).toHaveLength(4);
    expect(preview.executiveBriefing.capabilityReadiness.reusableCapabilities).toContain("Operations Strategist");
  });

  it("keeps preview deterministic and approval-gated", () => {
    const request = buildCompanyRequest(input());
    const first = buildCompanyExecutionPreview(request, storefront());
    const second = buildCompanyExecutionPreview(request, storefront());

    expect(second).toEqual(first);
    expect(first.mode).toBe("preview_only");
    expect(first.approvalState).toBe("execution_stopped_pending_approval");
    expect(first.actionRequired).toBe(true);
  });
});
