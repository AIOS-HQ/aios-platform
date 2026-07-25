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

export type MasonEvidenceClass = "simulated" | "mocked" | "source_derived" | "live";

export interface MasonAgentCapabilityRecord {
  agentKey: AiosAgentKey;
  connectors: readonly string[];
  runtime: WorkforceRuntimeContract;
}

const REGISTRY: Record<AiosAgentKey, MasonAgentCapabilityRecord> = AIOS_WORKFORCE.reduce(
  (acc, agent) => {
    acc[agent.key] = {
      agentKey: agent.key,
      connectors: getAgentConnectors(agent.key),
      runtime: WORKFORCE_RUNTIME_CONTRACTS[agent.key],
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

export function classifyMasonEvidenceType(evidenceType: string): MasonEvidenceClass {
  if (evidenceType === "live_runtime_proof" || evidenceType === "authenticated_runtime_proof") {
    return "live";
  }
  if (evidenceType === "configuration_proof" || evidenceType === "source_code_proof") {
    return "source_derived";
  }
  if (evidenceType === "unknown") {
    return "simulated";
  }
  return "mocked";
}
