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
  };
  decisionAnalysis: {
    options: Array<{
      strategyName: string;
      executiveSummary: string;
      advantages: string[];
      risks: string[];
      tradeOffs: string[];
      requiredBusinessCapabilities: string[];
      marketplaceIntelligenceOpportunities: string[];
      estimatedComplexity: "Low" | "Medium" | "High";
      estimatedTimeHorizon: "Short" | "Medium" | "Long";
      confidenceLevel: number;
      rationale: string;
    }>;
    recommendedStrategy: {
      strategyName: string;
      selectionRationale: string;
      alternativeRankingRationale: string;
      keyDecisionAssumptions: string[];
    };
  };
  capabilitySynthesis: {
    capabilities: Array<{
      capabilityName: string;
      businessPurpose: string;
      priority: "Critical" | "High" | "Medium" | "Low";
      existingMarketplaceCapability: boolean;
      reusableMarketplaceAssets: string[];
      requiresNewCapability: boolean;
      internalPlatformCapability: string;
      externalIntegrationRequired: string[];
      humanOwnership: string;
      aiOwnership: string;
      dependencies: string[];
      estimatedImplementationPhase: string;
      rationale: string;
    }>;
    capabilityMap: Record<
      | "Core Business"
      | "Customer Experience"
      | "Operations"
      | "Sales & Marketing"
      | "Finance"
      | "Compliance"
      | "Analytics"
      | "AI Workforce"
      | "Platform Services",
      {
        existingCapabilities: string[];
        missingCapabilities: string[];
        marketplaceOpportunities: string[];
        recommendedImplementationOrder: string[];
      }
    >;
  };
  executiveBriefing: {
    executiveSummary: string;
    strategicInsights: string[];
    keyOpportunities: string[];
    primaryRisks: string[];
    recommendedPriorities: string[];
    alternativeStrategies: string[];
    marketplaceIntelligenceFindings: string[];
    confidenceAssessment: string;
    nextExecutiveDecisions: string[];
    strategicOptions: string[];
    comparativeAnalysis: string;
    recommendedStrategy: string;
    executiveDecisionSummary: string;
    capabilitySummary: string;
    capabilityMap: string[];
    marketplaceReuseSummary: string;
    capabilityGaps: string[];
    recommendedBuildSequence: string[];
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

  const goals = request.goals.length > 0 ? request.goals : ["Establish initial traction"];
  const customerSummary = request.targetCustomers.length > 0 ? request.targetCustomers.join(", ") : "early adopters";
  const offerSummary = request.servicesOrProducts.length > 0 ? request.servicesOrProducts.join(", ") : "focused service offerings";
  const reusableCapabilities = [
    ...storefront.recommendations.workers.map((item) => item.name),
    ...storefront.recommendations.departments.map((item) => item.name),
    ...storefront.recommendations.connectors.map((item) => item.name),
    ...storefront.recommendations.dashboards.map((item) => item.name),
  ].slice(0, 10);

  const strategicAssessment = {
    businessVisionSummary:
      request.description.length > 0
        ? request.description
        : `Build a resilient ${request.industry || "multi-industry"} business with disciplined execution focus.`,
    industryAssessment: request.industry
      ? `${request.industry} presents attractive upside when differentiation and operating discipline are explicit.`
      : "Industry signal remains broad; sharper market focus will improve strategic precision.",
    targetCustomerAssessment: request.targetCustomers.length > 0
      ? `Priority customer segments appear to be ${customerSummary}, enabling targeted go-to-market sequencing.`
      : "Customer segmentation is currently broad, which can dilute early execution quality.",
    valueProposition: request.servicesOrProducts.length > 0
      ? `Deliver ${offerSummary} with consistent outcomes and executive-grade service reliability.`
      : "Define a concrete customer value proposition to raise execution confidence.",
    competitiveAdvantages: [
      ...goals.map((goal) => `Strategic focus on ${goal.toLowerCase()}`),
      "Early leverage of reusable Marketplace Intelligence capabilities",
    ].slice(0, 4),
    businessRisks: [
      request.targetCustomers.length === 0 ? "Undefined customer focus may delay repeatable growth" : "Demand assumptions should be validated early",
      request.servicesOrProducts.length === 0 ? "Service proposition remains underspecified" : "Scope expansion risk can reduce delivery quality",
    ],
    keyAssumptions: [
      "Leadership will approve phased execution before activation",
      "Reusable Marketplace capabilities can accelerate early operating outcomes",
      request.industry
        ? `Sustained demand exists in ${request.industry}`
        : "Industry demand assumptions require explicit validation",
    ],
    requiredBusinessCapabilities: reusableCapabilities,
    marketplaceIntelligenceOpportunities: [
      ...storefront.recommendations.companiesLikeYours
        .map((template) => `Template alignment candidate: ${template.name}`)
        .slice(0, 3),
      ...storefront.recommendations.bundles.map((bundle) => `Bundle accelerator: ${bundle.name}`).slice(0, 3),
    ],
    recommendedPhase1Priorities: [
      `Confirm go-to-market motion for ${offerSummary}`,
      `Validate conversion assumptions with ${customerSummary}`,
      "Sequence capability rollout around measurable business outcomes",
    ],
  };

  const decisionOptions: CompanyBuildExecutionPreview["decisionAnalysis"]["options"] = [
    {
      strategyName: "Focused Beachhead Execution",
      executiveSummary:
        "Concentrate on one high-fit customer segment, prove repeatable value quickly, and expand only after traction is validated.",
      advantages: [
        "Fastest path to measurable market proof.",
        "Lower operational complexity in phase one.",
        "Clearer strategic focus for the first execution cycle.",
      ],
      risks: [
        "May delay learning in adjacent segments.",
        "Could underbuild long-term scalability capabilities early on.",
      ],
      tradeOffs: [
        "Prioritizes speed over breadth.",
        "Accepts narrower initial coverage to improve execution confidence.",
      ],
      requiredBusinessCapabilities: strategicAssessment.requiredBusinessCapabilities.slice(0, 4),
      marketplaceIntelligenceOpportunities: strategicAssessment.marketplaceIntelligenceOpportunities.slice(0, 3),
      estimatedComplexity: "Low",
      estimatedTimeHorizon: "Short",
      confidenceLevel: 84,
      rationale:
        "This option exists because your inputs indicate immediate traction is a priority and disciplined rollout is preferred.",
    },
    {
      strategyName: "Balanced Capability Buildout",
      executiveSummary:
        "Balance launch velocity with operating resilience by activating core growth and delivery capabilities in parallel.",
      advantages: [
        "Improves medium-term operating durability.",
        "Reduces rework risk as demand grows.",
        "Maintains a healthier pace between growth and execution quality.",
      ],
      risks: [
        "Slightly slower initial market entry.",
        "Higher coordination overhead than a narrow launch.",
      ],
      tradeOffs: [
        "Moderate speed for stronger resilience.",
        "Higher upfront coordination for fewer downstream constraints.",
      ],
      requiredBusinessCapabilities: strategicAssessment.requiredBusinessCapabilities.slice(0, 5),
      marketplaceIntelligenceOpportunities: strategicAssessment.marketplaceIntelligenceOpportunities.slice(0, 4),
      estimatedComplexity: "Medium",
      estimatedTimeHorizon: "Medium",
      confidenceLevel: 78,
      rationale:
        "This option exists because your goals suggest both near-term momentum and durable operating discipline are important.",
    },
    {
      strategyName: "Aggressive Market Expansion",
      executiveSummary:
        "Pursue multi-segment growth and broad capability activation early to maximize upside and option value.",
      advantages: [
        "Highest potential long-term upside.",
        "Greater strategic optionality across customer segments.",
      ],
      risks: [
        "Highest execution complexity and dependency risk.",
        "Longer time before stable operating performance.",
      ],
      tradeOffs: [
        "Long-term opportunity over short-term simplicity.",
        "Broader ambition at the cost of execution certainty.",
      ],
      requiredBusinessCapabilities: strategicAssessment.requiredBusinessCapabilities.slice(0, 6),
      marketplaceIntelligenceOpportunities: strategicAssessment.marketplaceIntelligenceOpportunities.slice(0, 5),
      estimatedComplexity: "High",
      estimatedTimeHorizon: "Long",
      confidenceLevel: 67,
      rationale:
        "This option exists because your vision indicates growth ambition that could justify broader expansion if resourcing supports it.",
    },
  ];

  const recommendedStrategy = decisionOptions[0];

  const decisionAnalysis: CompanyBuildExecutionPreview["decisionAnalysis"] = {
    options: decisionOptions,
    recommendedStrategy: {
      strategyName: recommendedStrategy.strategyName,
      selectionRationale:
        "It provides the strongest near-term probability of traction while controlling operational risk under current assumptions.",
      alternativeRankingRationale:
        "Balanced Capability Buildout ranks second for resilience but lower speed, while Aggressive Market Expansion ranks third due to complexity and longer payback horizon.",
      keyDecisionAssumptions: strategicAssessment.keyAssumptions,
    },
  };

  const capabilitySynthesis: CompanyBuildExecutionPreview["capabilitySynthesis"] = {
    capabilities: [
      {
        capabilityName: "Go-to-Market Orchestration",
        businessPurpose: "Convert strategy into repeatable demand generation and customer acquisition execution.",
        priority: "Critical",
        existingMarketplaceCapability: true,
        reusableMarketplaceAssets: storefront.recommendations.bundles.map((bundle) => bundle.name).slice(0, 2),
        requiresNewCapability: false,
        internalPlatformCapability: "Marketplace-aligned campaign and workflow orchestration",
        externalIntegrationRequired: storefront.recommendations.connectors.map((connector) => connector.name).slice(0, 2),
        humanOwnership: "Founder / GTM Lead",
        aiOwnership: "Harmony + growth workers",
        dependencies: ["Customer segmentation clarity", "Offer packaging"],
        estimatedImplementationPhase: "Phase 1",
        rationale:
          "Required because the selected strategy depends on early market traction and repeatable acquisition signals.",
      },
      {
        capabilityName: "Service Delivery Control",
        businessPurpose: "Protect delivery quality and consistency while initial growth channels are activated.",
        priority: "High",
        existingMarketplaceCapability: true,
        reusableMarketplaceAssets: storefront.recommendations.departments.map((department) => department.name).slice(0, 2),
        requiresNewCapability: false,
        internalPlatformCapability: "Operational governance and approval controls",
        externalIntegrationRequired: [],
        humanOwnership: "Operations Lead",
        aiOwnership: "Delivery workers and quality monitors",
        dependencies: ["Go-to-Market Orchestration"],
        estimatedImplementationPhase: "Phase 1",
        rationale:
          "Required to ensure scale does not erode quality as new demand is captured.",
      },
      {
        capabilityName: "Executive Performance Analytics",
        businessPurpose: "Provide decision-grade visibility into growth, delivery reliability, and unit economics.",
        priority: "High",
        existingMarketplaceCapability: true,
        reusableMarketplaceAssets: storefront.recommendations.dashboards.map((dashboard) => dashboard.name).slice(0, 2),
        requiresNewCapability: false,
        internalPlatformCapability: "Cross-functional KPI and outcome telemetry",
        externalIntegrationRequired: storefront.recommendations.connectors.map((connector) => connector.name).slice(0, 2),
        humanOwnership: "Founder / Finance Lead",
        aiOwnership: "Analytics workers",
        dependencies: ["Go-to-Market Orchestration", "Service Delivery Control"],
        estimatedImplementationPhase: "Phase 1",
        rationale:
          "Required to validate assumptions and steer phased execution with measurable evidence.",
      },
      {
        capabilityName: "Compliance and Risk Guardrails",
        businessPurpose: "Maintain policy, contractual, and operational safeguards through growth.",
        priority: "Medium",
        existingMarketplaceCapability: request.industry.length > 0,
        reusableMarketplaceAssets: storefront.recommendations.companiesLikeYours.map((template) => template.name).slice(0, 2),
        requiresNewCapability: request.industry.length === 0,
        internalPlatformCapability: "Approval boundary and control policies",
        externalIntegrationRequired: [],
        humanOwnership: "Compliance / Legal Owner",
        aiOwnership: "Governance assistants",
        dependencies: ["Service Delivery Control"],
        estimatedImplementationPhase: "Phase 2",
        rationale:
          "Required to prevent governance gaps as execution complexity increases.",
      },
    ],
    capabilityMap: {
      "Core Business": {
        existingCapabilities: ["Strategy framing", "Marketplace-aligned template recommendations"],
        missingCapabilities: ["Codified service packaging playbooks"],
        marketplaceOpportunities: storefront.recommendations.companiesLikeYours.map((template) => template.name).slice(0, 2),
        recommendedImplementationOrder: ["Define offer", "Validate segment fit", "Standardize delivery"],
      },
      "Customer Experience": {
        existingCapabilities: ["Executive conversation intake", "Narrative execution preview"],
        missingCapabilities: ["Customer journey orchestration"],
        marketplaceOpportunities: storefront.collections.map((collection) => collection.label).slice(0, 2),
        recommendedImplementationOrder: ["Intake quality", "Experience instrumentation"],
      },
      Operations: {
        existingCapabilities: ["Approval-gated preview mode", "Operational preference capture"],
        missingCapabilities: ["Runbook automation layer"],
        marketplaceOpportunities: storefront.recommendations.departments.map((department) => department.name).slice(0, 2),
        recommendedImplementationOrder: ["Control points", "SOP hardening"],
      },
      "Sales & Marketing": {
        existingCapabilities: ["Discovery signal capture", "Recommendation intelligence"],
        missingCapabilities: ["Campaign optimization loops"],
        marketplaceOpportunities: storefront.recommendations.bundles.map((bundle) => bundle.name).slice(0, 2),
        recommendedImplementationOrder: ["Acquisition baseline", "Pipeline quality"],
      },
      Finance: {
        existingCapabilities: ["Executive KPI orientation"],
        missingCapabilities: ["Unit economics governance model"],
        marketplaceOpportunities: storefront.recommendations.dashboards.map((dashboard) => dashboard.name).slice(0, 2),
        recommendedImplementationOrder: ["Metric baseline", "Forecast discipline"],
      },
      Compliance: {
        existingCapabilities: ["Approval boundary controls"],
        missingCapabilities: ["Policy-specific compliance packs"],
        marketplaceOpportunities: storefront.recommendations.companiesLikeYours.map((template) => template.name).slice(0, 2),
        recommendedImplementationOrder: ["Risk controls", "Auditability"],
      },
      Analytics: {
        existingCapabilities: ["Discovery match scoring", "Recommendation insights"],
        missingCapabilities: ["Cross-domain decision analytics"],
        marketplaceOpportunities: storefront.recommendations.dashboards.map((dashboard) => dashboard.name).slice(0, 2),
        recommendedImplementationOrder: ["Signal capture", "Decision dashboards"],
      },
      "AI Workforce": {
        existingCapabilities: ["Worker recommendations", "Department recommendations"],
        missingCapabilities: ["Capability-to-worker operating matrix"],
        marketplaceOpportunities: storefront.recommendations.workers.map((worker) => worker.name).slice(0, 3),
        recommendedImplementationOrder: ["Worker alignment", "Ownership clarity"],
      },
      "Platform Services": {
        existingCapabilities: ["Storefront intelligence foundation", "Approval-gated orchestration"],
        missingCapabilities: ["Capability lifecycle governance"],
        marketplaceOpportunities: storefront.bundles.map((bundle) => bundle.name).slice(0, 2),
        recommendedImplementationOrder: ["Foundation reuse", "Capability lifecycle controls"],
      },
    },
  };

  const executiveBriefing = {
    executiveSummary:
      `Harmony interprets your strategy as a ${request.industry || "focused"} business targeting ${customerSummary}, with near-term value anchored on ${offerSummary}. ` +
      "The current recommendation set favors fast reuse of proven capabilities while preserving approval-gated execution.",
    strategicInsights: [
      `Your stated priorities indicate a strong emphasis on ${goals.join(", ").toLowerCase()}.`,
      "Execution quality and prioritization discipline are likely to determine early momentum.",
    ],
    keyOpportunities: [
      ...strategicAssessment.marketplaceIntelligenceOpportunities,
      "Accelerate time-to-value by sequencing reusable capabilities before net-new build work.",
    ].slice(0, 4),
    primaryRisks: strategicAssessment.businessRisks,
    recommendedPriorities: strategicAssessment.recommendedPhase1Priorities,
    alternativeStrategies: [
      "Growth-first path: prioritize market acquisition systems before broad operating expansion.",
      "Operations-first path: prioritize service quality and retention before aggressive expansion.",
      "Balanced path: parallelize selective growth and operating capabilities with tighter approval checkpoints.",
    ],
    marketplaceIntelligenceFindings: [
      `Reusable capability signals identified: ${reusableCapabilities.slice(0, 5).join(", ") || "none yet"}.`,
      `Discovery surfaced ${storefront.discovery.defaultResult.length} relevant capability match${storefront.discovery.defaultResult.length === 1 ? "" : "es"}.`,
      `Collections available for acceleration: ${storefront.collections.length}.`,
    ],
    confidenceAssessment:
      request.description.length > 0 && request.targetCustomers.length > 0 && request.servicesOrProducts.length > 0
        ? "Confidence is moderate-high: strategic intent is sufficiently defined for phased planning, with remaining uncertainty concentrated in demand and execution assumptions."
        : "Confidence is moderate: additional clarity on customer and value proposition details will materially improve recommendation precision.",
    nextExecutiveDecisions: [
      "Select the initial execution path (growth-first, operations-first, or balanced).",
      "Confirm which reusable Marketplace capabilities should be activated first.",
      "Approve phased execution scope before any activation step.",
    ],
    strategicOptions: decisionAnalysis.options.map(
      (option) => `${option.strategyName}: ${option.executiveSummary}`,
    ),
    comparativeAnalysis:
      "The focused strategy optimizes for speed and early signal quality, the balanced strategy improves medium-term resilience, and the expansion strategy prioritizes long-term upside with higher delivery risk.",
    recommendedStrategy:
      `${decisionAnalysis.recommendedStrategy.strategyName} is recommended because it best aligns with your current intent, risk posture, and requirement for approval-gated execution.`,
    executiveDecisionSummary:
      "Proceed with a focused beachhead strategy, validate assumptions rapidly, and sequence broader capability expansion only after repeatable outcomes are established.",
    capabilitySummary:
      `Harmony synthesized ${capabilitySynthesis.capabilities.length} foundational capabilities required to execute the selected strategy with control and measurable outcomes.`,
    capabilityMap: Object.entries(capabilitySynthesis.capabilityMap).map(
      ([section, details]) => `${section}: existing ${details.existingCapabilities.length}, missing ${details.missingCapabilities.length}`,
    ),
    marketplaceReuseSummary:
      `Marketplace reuse is concentrated in ${capabilitySynthesis.capabilities
        .filter((capability) => capability.existingMarketplaceCapability)
        .map((capability) => capability.capabilityName)
        .join(", ")}.`,
    capabilityGaps: capabilitySynthesis.capabilities
      .filter((capability) => capability.requiresNewCapability)
      .map((capability) => capability.capabilityName),
    recommendedBuildSequence: capabilitySynthesis.capabilities
      .slice()
      .sort((left, right) => {
        const priorityRank: Record<"Critical" | "High" | "Medium" | "Low", number> = {
          Critical: 0,
          High: 1,
          Medium: 2,
          Low: 3,
        };
        return priorityRank[left.priority] - priorityRank[right.priority];
      })
      .map((capability) => `${capability.estimatedImplementationPhase}: ${capability.capabilityName}`),
  };

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
    strategicAssessment,
    decisionAnalysis,
    capabilitySynthesis,
    executiveBriefing,
  };
}
