import "server-only";

import {
  AIOS_WORKFORCE,
  type AiosAgentKey,
  getAgentConnectors,
} from "@/lib/workforce/registry";
import {
  WORKFORCE_RUNTIME_CONTRACTS,
  type WorkforceRuntimeContract,
} from "@/lib/workforce/runtime-contracts";

export const MASON_CAPABILITY_REGISTRY_VERSION = "1.0" as const;

export type MasonEvidenceClass = "live" | "source_derived" | "simulated" | "mocked" | "unknown";
export type MasonCapabilityCategory = "runtime" | "connector" | "governance" | "quality";
export type MasonImplementationStatus = "implemented" | "partial" | "planned" | "unimplemented";
export type MasonRuntimeState = "operational" | "degraded" | "blocked" | "unknown";
export type MasonValidationStatus = "validated" | "failing" | "not_run" | "unknown";
export type MasonReadinessStatus = "ready" | "operational_with_approval" | "blocked" | "partial";

export interface MasonCapabilityDescriptor {
  capabilityId: string;
  agent: AiosAgentKey;
  category: MasonCapabilityCategory;
  implementationStatus: MasonImplementationStatus;
  evidenceSource: string;
  evidenceClass: MasonEvidenceClass;
  runtimeState: MasonRuntimeState;
  governanceBoundary: string;
  approvalRequirement: string;
  connectorDependencies: string[];
  infrastructureDependencies: string[];
  credentialDependencies: string[];
  productionDependencies: string[];
  validationStatus: MasonValidationStatus;
  readinessStatus: MasonReadinessStatus;
  lastVerifiedAt: string | null;
  blockerReason: string | null;
  nextRequiredAction: string;
}

export interface MasonAgentCapabilityRecord {
  agentKey: AiosAgentKey;
  connectors: readonly string[];
  runtime: WorkforceRuntimeContract;
  capabilities: MasonCapabilityDescriptor[];
}

function createCapabilityDescriptor(agentKey: AiosAgentKey): MasonCapabilityDescriptor {
  const runtime = WORKFORCE_RUNTIME_CONTRACTS[agentKey];
  const connectorDependencies = runtime.connectorDependencies.map((dependency) => dependency.provider);
  const credentialDependencies = connectorDependencies.map((provider) => `${provider}_credentials`);
  const productionDependencies = connectorDependencies.length > 0
    ? connectorDependencies.map((provider) => `${provider}_production_config`)
    : ["internal_policy_boundary"];

  return {
    capabilityId: `runtime_contract.${agentKey}`,
    agent: agentKey,
    category: "runtime",
    implementationStatus: "implemented",
    evidenceSource: "workforce_runtime_contract_source",
    evidenceClass: "source_derived",
    runtimeState: runtime.executionCapability === "none" ? "unknown" : "operational",
    governanceBoundary: runtime.autonomyPolicy,
    approvalRequirement: runtime.approvalPolicy,
    connectorDependencies,
    infrastructureDependencies: ["runtime_identity", "workforce_runtime_contracts"],
    credentialDependencies,
    productionDependencies,
    validationStatus: "validated",
    readinessStatus: runtime.executionCapability === "none"
      ? "blocked"
      : runtime.executionCapability === "guided_runtime"
        ? "operational_with_approval"
        : "ready",
    lastVerifiedAt: null,
    blockerReason: runtime.executionCapability === "none" ? "runtime_not_implemented" : null,
    nextRequiredAction: runtime.executionCapability === "none"
      ? "Implement runtime handlers and certify evidence"
      : "Provide live runtime evidence for production verification",
  };
}

const REGISTRY: Record<AiosAgentKey, MasonAgentCapabilityRecord> = AIOS_WORKFORCE.reduce(
  (acc, agent) => {
    acc[agent.key] = {
      agentKey: agent.key,
      connectors: getAgentConnectors(agent.key),
      runtime: WORKFORCE_RUNTIME_CONTRACTS[agent.key],
      capabilities: [createCapabilityDescriptor(agent.key)],
    };
    return acc;
  },
  {} as Record<AiosAgentKey, MasonAgentCapabilityRecord>,
);

export function getMasonCapabilityRecord(agentKey: AiosAgentKey): MasonAgentCapabilityRecord {
  return REGISTRY[agentKey];
}

export function listMasonCapabilityRecords(): MasonAgentCapabilityRecord[] {
  return AIOS_WORKFORCE.map((agent) => REGISTRY[agent.key]);
}

export function listMasonCapabilities(): MasonCapabilityDescriptor[] {
  return listMasonCapabilityRecords().flatMap((record) => record.capabilities);
}

export function classifyMasonEvidenceType(evidenceType: string): MasonEvidenceClass {
  if (evidenceType === "live_runtime_proof" || evidenceType === "authenticated_runtime_proof") {
    return "live";
  }
  if (evidenceType === "configuration_proof" || evidenceType === "source_code_proof") {
    return "source_derived";
  }
  if (evidenceType === "unknown" || evidenceType === "simulation_proof") {
    return "simulated";
  }
  if (evidenceType === "mock_proof") {
    return "mocked";
  }
  return "unknown";
}
