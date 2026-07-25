import "server-only";

import type { EvidenceMetadata, EvidenceType } from "@/lib/evidence/model";
import {
  createCertificationEvidence,
  evidenceTypeFromVercelTier,
} from "@/lib/evidence/certification";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { isDevConfigured } from "@/lib/integrations/registry-status";
import { assessIntegrationReadiness } from "@/lib/integrations/readiness";
import {
  AIOS_WORKFORCE,
  type AiosAgent,
  type AiosAgentKey,
  isFounderOnlyAgent,
} from "@/lib/workforce/registry";
import { getMasonCapabilityRecord } from "@/lib/mason/capability-registry";
import {
  type WorkforceConnectorDependency,
  type WorkforceRuntimeContract,
} from "@/lib/workforce/runtime-contracts";

export type WorkforceCertificationStatus =
  | "production_ready"
  | "operational_with_approval"
  | "partial"
  | "advisory_only"
  | "configuration_required"
  | "blocked"
  | "metadata_only"
  | "unsupported";

export const WORKFORCE_STATUS_LABELS: Record<WorkforceCertificationStatus, string> = {
  production_ready: "Production ready",
  operational_with_approval: "Operational with approval",
  partial: "Partial",
  advisory_only: "Advisory only",
  configuration_required: "Configuration required",
  blocked: "Blocked",
  metadata_only: "Metadata only",
  unsupported: "Unsupported",
};

export interface WorkforceDependencyReadiness
  extends WorkforceConnectorDependency,
    EvidenceMetadata<{
      scope: "connector_dependency";
      provider: string;
      runtimeProbed: boolean;
    }> {
  exists: boolean;
  configured: boolean;
  connected: boolean;
  status: WorkforceCertificationStatus;
  blockers: string[];
  implementedCapabilities: string[];
  missingCapabilities: string[];
}

export interface WorkforceAgentCertification
  extends EvidenceMetadata<{
    scope: "workforce_runtime_contract";
    runtimeProbed: false;
    dependencyChecks: number;
  }> {
  agent: AiosAgent;
  founderOnly: boolean;
  juliusAccess: AiosAgent["julius"];
  contract: WorkforceRuntimeContract;
  status: WorkforceCertificationStatus;
  label: string;
  health: "healthy" | "degraded" | "blocked";
  blockers: string[];
  dependencyReadiness: WorkforceDependencyReadiness[];
}

const SOCIAL_CAPABILITY_IDS: Record<string, Set<string>> = {
  linkedin: new Set(["textPost", "documentCarousel"]),
  x: new Set(["textPost", "imagePost", "multiImagePost"]),
  youtube: new Set([
    "upload_video",
    "upload_short",
    "upload_thumbnail",
    "edit_metadata",
    "schedule_publish",
    "add_to_playlist",
  ]),
};

const VERCEL_READ_CAPABILITIES = new Set(["deployment_status", "build_status", "list_deployments"]);

function providerConfigured(provider: string): boolean {
  const def = getConnectorDefinition(provider);
  if (def) return isDevConfigured(def);
  const legacy = getConnector(provider);
  if (legacy) return isConnectorConfigured(legacy);
  return false;
}

function socialProviderBlockers(provider: string, capabilities: string[]): string[] {
  if (provider === "linkedin" && capabilities.some((capability) => SOCIAL_CAPABILITY_IDS.linkedin.has(capability))) {
    return [
      ...(!process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN ? ["LinkedIn publisher token is not configured."] : []),
      ...(!process.env.LINKEDIN_ORGANIZATION_URN && !process.env.LINKEDIN_ORGANIZATION_ID
        ? ["LinkedIn organization is not configured."]
        : []),
    ];
  }
  return [];
}

function socialCapabilityImplemented(provider: string, capability: string): boolean {
  return SOCIAL_CAPABILITY_IDS[provider]?.has(capability) ?? false;
}

function vercelCapabilityImplemented(capability: string): boolean {
  return VERCEL_READ_CAPABILITIES.has(capability);
}

function dependencyEvidenceType(
  health: Awaited<ReturnType<typeof getProviderHealth>> | null,
): EvidenceType {
  if (health?.deploymentStatus) {
    return evidenceTypeFromVercelTier(health.deploymentStatus.evidenceTier);
  }
  return health ? "authenticated_runtime_proof" : "configuration_proof";
}

async function evaluateDependency(
  userId: string | null,
  dependency: WorkforceConnectorDependency,
): Promise<WorkforceDependencyReadiness> {
  const def = getConnectorDefinition(dependency.provider);
  const configured = providerConfigured(dependency.provider);
  if (!def) {
    const evidence = createCertificationEvidence({
      status: "unsupported" as const,
      evidenceType: "source_code_proof",
      observedBy: "workforce.certification.dependency",
      confidence: 1,
      details: {
        scope: "connector_dependency" as const,
        provider: dependency.provider,
        runtimeProbed: false,
      },
    });
    return {
      ...dependency,
      ...evidence,
      exists: false,
      configured: false,
      connected: false,
      blockers: ["Connector is not registered."],
      implementedCapabilities: [],
      missingCapabilities: dependency.capabilities,
    };
  }

  const health = userId ? await getProviderHealth(userId, dependency.provider) : null;
  const readiness = health ? assessIntegrationReadiness(def, health) : null;
  const runtimeImplemented = new Set(
    health?.capabilityDetails.filter((cap) => cap.implemented).map((cap) => cap.id) ?? [],
  );
  const implementedCapabilities = dependency.capabilities.filter(
    (capability) =>
      runtimeImplemented.has(capability) ||
      socialCapabilityImplemented(dependency.provider, capability) ||
      (dependency.provider === "vercel" && vercelCapabilityImplemented(capability)),
  );
  const missingCapabilities = dependency.capabilities.filter((capability) => !implementedCapabilities.includes(capability));
  const blockers = [
    ...(readiness?.founderActions ?? []),
    ...socialProviderBlockers(dependency.provider, dependency.capabilities),
    ...(missingCapabilities.length > 0 ? [`Missing runtime capability: ${missingCapabilities.join(", ")}.`] : []),
    ...(!configured ? [`${dependency.provider} configuration is not complete.`] : []),
  ];

  let status: WorkforceCertificationStatus;
  if (missingCapabilities.length === dependency.capabilities.length) status = "metadata_only";
  else if (blockers.length > 0 && dependency.required) status = "configuration_required";
  else if (blockers.length > 0) status = "configuration_required";
  else status = dependency.required ? "production_ready" : "operational_with_approval";

  const evidenceType = dependencyEvidenceType(health);
  const evidence = createCertificationEvidence({
    status,
    evidenceType,
    observedBy: "workforce.certification.dependency",
    confidence:
      evidenceType === "live_runtime_proof"
        ? 1
        : evidenceType === "authenticated_runtime_proof"
          ? 0.85
          : evidenceType === "configuration_proof"
            ? 0.75
            : 0,
    details: {
      scope: "connector_dependency" as const,
      provider: dependency.provider,
      runtimeProbed: Boolean(health),
    },
  });
  return {
    ...dependency,
    ...evidence,
    exists: true,
    configured: health?.configured ?? configured,
    connected: health?.connected ?? false,
    blockers,
    implementedCapabilities,
    missingCapabilities,
  };
}

function baseStatusFor(agent: AiosAgent, deps: WorkforceDependencyReadiness[]): WorkforceCertificationStatus {
  const contract = getMasonCapabilityRecord(agent.key).runtime;
  const required = deps.filter((dep) => dep.required);
  if (required.some((dep) => dep.status === "unsupported" || dep.status === "metadata_only")) return "blocked";
  if (required.some((dep) => dep.blockers.length > 0)) return "configuration_required";
  if (contract.executionCapability === "real_runtime") {
    return isFounderOnlyAgent(agent.key) ? "operational_with_approval" : "production_ready";
  }
  if (contract.executionCapability === "guided_runtime") return "operational_with_approval";
  if (contract.executionCapability === "advisory") return "advisory_only";
  return "metadata_only";
}

export async function certifyWorkforceAgent(
  agent: AiosAgent,
  opts: { userId?: string | null } = {},
): Promise<WorkforceAgentCertification> {
  const contract = getMasonCapabilityRecord(agent.key).runtime;
  const dependencyReadiness = await Promise.all(
    contract.connectorDependencies.map((dependency) => evaluateDependency(opts.userId ?? null, dependency)),
  );
  const dependencyBlockers = dependencyReadiness.flatMap((dep) =>
    dep.blockers.map((blocker) => `${dep.provider}: ${blocker}`),
  );
  const status = baseStatusFor(agent, dependencyReadiness);
  const blockers = [
    ...dependencyBlockers,
    ...contract.unsupportedCapabilities.map((capability) => `Unsupported: ${capability}.`),
  ];

  const evidence = createCertificationEvidence({
    status,
    evidenceType: "source_code_proof",
    observedBy: "workforce.certification.runtime_contract",
    confidence: 1,
    details: {
      scope: "workforce_runtime_contract" as const,
      runtimeProbed: false as const,
      dependencyChecks: dependencyReadiness.length,
    },
  });

  return {
    agent,
    founderOnly: isFounderOnlyAgent(agent.key),
    juliusAccess: agent.julius,
    contract,
    ...evidence,
    label: WORKFORCE_STATUS_LABELS[status],
    // Runtime contracts and dependency metadata are not live agent health.
    health: status === "blocked" ? "blocked" : "degraded",
    blockers,
    dependencyReadiness,
  };
}

export async function certifyAiosWorkforce(opts: { userId?: string | null } = {}) {
  const entries = await Promise.all(AIOS_WORKFORCE.map((agent) => certifyWorkforceAgent(agent, opts)));
  return Object.fromEntries(entries.map((entry) => [entry.agent.key, entry])) as Record<AiosAgentKey, WorkforceAgentCertification>;
}

export function workforceConnectorIdsForAgent(agent: AiosAgentKey): string[] {
  const record = getMasonCapabilityRecord(agent);
  return Array.from(new Set([...record.connectors, ...record.runtime.connectorDependencies.map((dep) => dep.provider)]));
}
