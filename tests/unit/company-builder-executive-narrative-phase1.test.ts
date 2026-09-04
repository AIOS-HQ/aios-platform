import { describe, expect, it } from "vitest";
import {
  buildCompanyExecutionPreview,
  buildCompanyRequest,
  type CompanyBuildRequestInput,
} from "@/lib/harmony/company-builder";
import type { StorefrontViewModel } from "@/lib/marketplace/storefront";

function input(): CompanyBuildRequestInput {
  return {
    description: "Build a strategic growth advisory business for SMB operators",
    goals: ["Recurring revenue", "Market expansion"],
    industry: "Professional Services",
    servicesOrProducts: ["Advisory", "Implementation"],
    targetCustomers: ["SMBs"],
    operationalPreferences: ["Executive approvals", "Quality controls"],
  };
}

function storefront(): StorefrontViewModel {
  return {
    catalog: {},
    visibleItems: [],
    displayItems: [],
    signal: { industry: "Professional Services", tags: ["growth"] },
    installedIds: new Set(),
    installCounts: {},
    recommendations: {
      workers: [{ id: "w1", name: "Growth Strategist" } as never],
      departments: [{ id: "d1", name: "Advisory Department" } as never],
      skills: [],
      connectors: [{ id: "c1", name: "CRM Connector" } as never],
      dashboards: [{ id: "db1", name: "Executive Dashboard" } as never],
      workflowPacks: [],
      bundles: [{ id: "b1", name: "Growth Bundle" } as never],
      companiesLikeYours: [{ id: "tpl1", name: "Consulting Template" } as never],
    },
    collections: [{ slug: "recommended", label: "Recommended", description: "", items: [] }],
    bundles: [{ id: "b1", name: "Growth Bundle" } as never],
    discovery: {
      defaultResult: [{ item: { id: "m1", name: "Pipeline Accelerator" } as never, score: 8.5, matched: ["growth"] }],
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

describe("company builder executive narrative phase 1", () => {
  it("generates strategic assessment sections", () => {
    const request = buildCompanyRequest(input());
    const preview = buildCompanyExecutionPreview(request, storefront());

    expect(preview.strategicAssessment.businessVisionSummary.length).toBeGreaterThan(0);
    expect(preview.strategicAssessment.industryAssessment.toLowerCase()).toContain("attractive upside");
    expect(preview.strategicAssessment.recommendedPhase1Priorities.length).toBeGreaterThan(0);
  });

  it("generates executive briefing narrative sections", () => {
    const request = buildCompanyRequest(input());
    const preview = buildCompanyExecutionPreview(request, storefront());

    expect(preview.executiveBriefing.executiveSummary.length).toBeGreaterThan(0);
    expect(preview.executiveBriefing.strategicInsights.length).toBeGreaterThan(0);
    expect(preview.executiveBriefing.keyOpportunities.length).toBeGreaterThan(0);
    expect(preview.executiveBriefing.primaryRisks.length).toBeGreaterThan(0);
    expect(preview.executiveBriefing.alternativeStrategies.length).toBeGreaterThan(0);
    expect(preview.executiveBriefing.marketplaceIntelligenceFindings.length).toBeGreaterThan(0);
    expect(preview.executiveBriefing.confidenceAssessment.toLowerCase()).toContain("confidence");
    expect(preview.executiveBriefing.nextExecutiveDecisions.length).toBeGreaterThan(0);
  });

  it("remains deterministic and preview-only", () => {
    const request = buildCompanyRequest(input());
    const first = buildCompanyExecutionPreview(request, storefront());
    const second = buildCompanyExecutionPreview(request, storefront());

    expect(second).toEqual(first);
    expect(first.mode).toBe("preview_only");
    expect(first.approvalState).toBe("execution_stopped_pending_approval");
    expect(first.actionRequired).toBe(true);
  });
});
