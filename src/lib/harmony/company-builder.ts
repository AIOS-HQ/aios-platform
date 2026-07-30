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
  executiveBriefing: {
    understanding: string;
    intentSignals: string[];
    capabilityReadiness: {
      reusableCapabilities: string[];
      likelyNewCapabilities: string[];
    };
    executionPhases: string[];
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

  const understanding = [
    request.description,
    request.industry ? `Industry focus: ${request.industry}.` : null,
    request.servicesOrProducts.length > 0 ? `Primary offers: ${request.servicesOrProducts.join(", ")}.` : null,
    request.targetCustomers.length > 0 ? `Target customers: ${request.targetCustomers.join(", ")}.` : null,
  ]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ");

  const intentSignals = [
    ...request.goals,
    ...request.operationalPreferences,
    ...request.servicesOrProducts,
    ...request.targetCustomers,
  ].slice(0, 8);

  const reusableCapabilities = [
    ...storefront.recommendations.workers.map((item) => item.name),
    ...storefront.recommendations.departments.map((item) => item.name),
    ...storefront.recommendations.connectors.map((item) => item.name),
    ...storefront.recommendations.dashboards.map((item) => item.name),
  ].slice(0, 10);

  const likelyNewCapabilities = [
    request.operationalPreferences.length > 0
      ? "Custom operating policies aligned to your operational preferences"
      : null,
    request.servicesOrProducts.length > 0
      ? "Service-specific workflows tailored to your product and delivery model"
      : null,
    request.targetCustomers.length > 0
      ? "Customer-segment-specific journey and support automations"
      : null,
  ].filter((item): item is string => Boolean(item));

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
    executiveBriefing: {
      understanding:
        understanding.length > 0
          ? understanding
          : "Harmony captured your intent and is preparing capability recommendations.",
      intentSignals,
      capabilityReadiness: {
        reusableCapabilities,
        likelyNewCapabilities,
      },
      executionPhases: [
        "Phase 1: Validate strategic intent and operating priorities",
        "Phase 2: Reuse Marketplace Intelligence capabilities where fit is high",
        "Phase 3: Flag gaps that may require net-new company capabilities",
        "Phase 4: Stop before execution and request explicit approval",
      ],
    },
  };
}
