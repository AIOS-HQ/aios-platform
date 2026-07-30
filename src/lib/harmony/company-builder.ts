import type { StorefrontViewModel } from "@/lib/marketplace/storefront";
import type { DiscoveryResult } from "@/lib/marketplace/discovery";

export interface CompanyBuildRequestInput {
  description: string;
  goals: string[];
  industry: string;
  servicesOrProducts: string[];
  targetCustomers: string[];
  operationalPreferences: string[];
}

export interface CompanyBuildRequest {
  description: string;
  goals: string[];
  industry: string;
  servicesOrProducts: string[];
  targetCustomers: string[];
  operationalPreferences: string[];
  profileSignal: {
    tags: string[];
    industry: string;
  };
}

export interface CompanyBuildExecutionPreview {
  mode: "preview_only";
  actionRequired: true;
  approvalState: "execution_stopped_pending_approval";
  recommendations: {
    workers: string[];
    departments: string[];
    connectors: string[];
    dashboards: string[];
    bundles: string[];
    templates: string[];
  };
  discoveryMatches: Array<{ id: string; name: string; score: number }>;
  collections: Array<{ slug: string; label: string; itemCount: number }>;
  notes: string[];
  strategicAssessment: {
    businessVisionSummary: string;
    industryAssessment: string;
    targetCustomerAssessment: string;
    valueProposition: string;
    competitiveAdvantages: string[];
    businessRisks: string[];
    keyAssumptions: string[];
    requiredBusinessCapabilities: string[];
    marketplaceIntelligenceOpportunities: string[];
    recommendedPhase1Priorities: string[];
    strategicObservations: string[];
    businessOpportunities: string[];
    recommendedExecutionSequence: string[];
  };
}

function normalizedList(input: string[]): string[] {
  return Array.from(new Set(input.map((value) => value.trim()).filter((value) => value.length > 0)));
}

export function buildCompanyRequest(input: CompanyBuildRequestInput): CompanyBuildRequest {
  const goals = normalizedList(input.goals);
  const servicesOrProducts = normalizedList(input.servicesOrProducts);
  const targetCustomers = normalizedList(input.targetCustomers);
  const operationalPreferences = normalizedList(input.operationalPreferences);
  const tags = normalizedList([
    ...goals,
    ...servicesOrProducts,
    ...targetCustomers,
    ...operationalPreferences,
    input.description,
  ]);

  return {
    description: input.description.trim(),
    goals,
    industry: input.industry.trim(),
    servicesOrProducts,
    targetCustomers,
    operationalPreferences,
    profileSignal: {
      tags,
      industry: input.industry.trim(),
    },
  };
}

function toDiscoveryMatches(results: DiscoveryResult[]): CompanyBuildExecutionPreview["discoveryMatches"] {
  return results.slice(0, 6).map((result) => ({
    id: result.item.id,
    name: result.item.name,
    score: result.score,
  }));
}

export function buildCompanyExecutionPreview(
  request: CompanyBuildRequest,
  storefront: StorefrontViewModel,
): CompanyBuildExecutionPreview {
  const tags = request.profileSignal.tags;
  const templateRecommendations = storefront.recommendations.companiesLikeYours.map((template) => template.name);

  const primaryGoals = request.goals.length > 0 ? request.goals : ["Establish operational traction"];
  const customerFocus = request.targetCustomers.length > 0 ? request.targetCustomers.join(", ") : "early adopters";
  const servicesFocus = request.servicesOrProducts.length > 0 ? request.servicesOrProducts.join(", ") : "high-value service offerings";

  const requiredCapabilities = [
    ...storefront.recommendations.workers.map((item) => item.name),
    ...storefront.recommendations.departments.map((item) => item.name),
    ...storefront.recommendations.connectors.map((item) => item.name),
    ...storefront.recommendations.dashboards.map((item) => item.name),
  ].slice(0, 10);

  const phasePriorities = [
    `Clarify a go-to-market plan around ${servicesFocus}`,
    `Validate demand and conversion assumptions for ${customerFocus}`,
    "Sequence capability rollout to deliver measurable operating outcomes",
  ];

  return {
    mode: "preview_only",
    actionRequired: true,
    approvalState: "execution_stopped_pending_approval",
    recommendations: {
      workers: storefront.recommendations.workers.map((item) => item.name),
      departments: storefront.recommendations.departments.map((item) => item.name),
      connectors: storefront.recommendations.connectors.map((item) => item.name),
      dashboards: storefront.recommendations.dashboards.map((item) => item.name),
      bundles: storefront.recommendations.bundles.map((bundle) => bundle.name),
      templates: templateRecommendations,
    },
    discoveryMatches: toDiscoveryMatches(storefront.discovery.defaultResult),
    collections: storefront.collections.map((collection) => ({
      slug: collection.slug,
      label: collection.label,
      itemCount: collection.items.length,
    })),
    notes: [
      "Preview only — no provisioning or deployment is executed.",
      "Execution requires explicit approval.",
      tags.length > 0 ? `Intent tags captured: ${tags.join(", ")}` : "Intent tags were not provided.",
    ],
    strategicAssessment: {
      businessVisionSummary:
        request.description.length > 0
          ? request.description
          : `Build a resilient ${request.industry || "multi-industry"} company with clear execution focus.`,
      industryAssessment: request.industry
        ? `${request.industry} has strong opportunity when execution quality and differentiation are explicit.`
        : "Industry signal is broad; Harmony recommends clarifying market focus for sharper positioning.",
      targetCustomerAssessment: request.targetCustomers.length > 0
        ? `Primary customer focus appears to be ${customerFocus}, which supports targeted capability planning.`
        : "Target customer definition is currently broad; tighter segmentation will improve strategic precision.",
      valueProposition:
        request.servicesOrProducts.length > 0
          ? `Deliver ${servicesFocus} with operational consistency and measurable business outcomes.`
          : "Define a concrete customer value proposition to accelerate execution confidence.",
      competitiveAdvantages: [
        ...primaryGoals.map((goal) => `Strategic focus on ${goal.toLowerCase()}`),
        "Ability to reuse Marketplace Intelligence capabilities early",
      ].slice(0, 4),
      businessRisks: [
        request.targetCustomers.length === 0 ? "Customer segment ambiguity may slow execution quality" : "Customer acquisition assumptions should be validated early",
        request.servicesOrProducts.length === 0 ? "Value proposition is currently underspecified" : "Service delivery scope may expand without disciplined prioritization",
      ],
      keyAssumptions: [
        "Founding team will approve phased execution before activation",
        "Marketplace-reusable capabilities can accelerate initial operations",
        request.industry
          ? `Industry-specific demand exists for ${servicesFocus}`
          : "Industry demand assumptions still require explicit validation",
      ],
      requiredBusinessCapabilities: requiredCapabilities,
      marketplaceIntelligenceOpportunities: [
        ...storefront.recommendations.companiesLikeYours
          .map((template) => `Template alignment candidate: ${template.name}`)
          .slice(0, 3),
        ...storefront.recommendations.bundles.map((bundle) => `Bundle accelerator: ${bundle.name}`).slice(0, 3),
      ],
      recommendedPhase1Priorities: phasePriorities,
      strategicObservations: [
        `Harmony detected ${primaryGoals.length} high-priority strategic objective${primaryGoals.length === 1 ? "" : "s"}.`,
        `Marketplace surfaced ${requiredCapabilities.length} reusable capability signals for initial execution.`,
      ],
      businessOpportunities: [
        "Convert strategic intent into phased capability milestones",
        "Use reusable Marketplace capabilities to reduce time-to-first-value",
      ],
      recommendedExecutionSequence: [
        "Confirm business intent and strategic assumptions",
        "Map reusable Marketplace capabilities to the first operating model",
        "Define net-new capability gaps and hold for explicit approval",
      ],
    },
  };
}
