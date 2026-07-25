import "server-only";

import type { AiosAgent, AiosAgentKey } from "@/lib/workforce/registry";
import { AIOS_WORKFORCE, isFounderOnlyAgent } from "@/lib/workforce/registry";
import {
  type WorkforceAgentCertification,
  type WorkforceCertificationStatus,
} from "@/lib/workforce/certification";
import {
  classifyMasonEvidenceType,
  listMasonCapabilities,
  type MasonCapabilityDescriptor,
  type MasonEvidenceClass,
} from "@/lib/mason/capability-registry";

type FounderCapabilityStatus = "READY" | "BLOCKED" | "PARTIAL" | "OPERATIONAL_WITH_APPROVAL";

export interface FounderReadinessCapabilityReport {
  capabilityId: string;
  agent: AiosAgent;
  founderOnly: boolean;
  capability: MasonCapabilityDescriptor;
  status: FounderCapabilityStatus;
  evidenceType: string;
  evidenceClass: MasonEvidenceClass;
  observedAt: string;
  observedBy: string;
  reason: string | null;
  requiredAction: string;
}

export interface FounderReadinessReport {
  generatedAt: string;
  generatedBy: string;
  capabilityRegistryVersion: string;
  canonicalPath: "workforce.certification";
  founderStatus: FounderCapabilityStatus;
  founderStatusLabel: string;
  founderBlockers: string[];
  capabilities: FounderReadinessCapabilityReport[];
}

const FOUNDER_STATUS_LABELS: Record<FounderCapabilityStatus, string> = {
  READY: "Ready",
  OPERATIONAL_WITH_APPROVAL: "Operational with approval",
  PARTIAL: "Partial",
  BLOCKED: "Blocked",
};

function toFounderStatus(status: WorkforceCertificationStatus): FounderCapabilityStatus {
  if (status === "production_ready") return "READY";
  if (status === "operational_with_approval") return "OPERATIONAL_WITH_APPROVAL";
  if (status === "partial") return "PARTIAL";
  return "BLOCKED";
}

function toReportItem(input: WorkforceAgentCertification, capability: MasonCapabilityDescriptor): FounderReadinessCapabilityReport {
  return {
    capabilityId: capability.capabilityId,
    agent: input.agent,
    founderOnly: isFounderOnlyAgent(input.agent.key),
    capability,
    status: toFounderStatus(input.status),
    evidenceType: input.evidenceType,
    evidenceClass: classifyMasonEvidenceType(input.evidenceType),
    observedAt: input.observedAt,
    observedBy: input.observedBy,
    reason: input.blockers.length > 0 ? input.blockers[0] : null,
    requiredAction: input.blockers.length > 0 ? "Resolve blockers and provide required evidence" : capability.nextRequiredAction,
  };
}

function summarizeFounderStatus(items: FounderReadinessCapabilityReport[]): {
  status: FounderCapabilityStatus;
  blockers: string[];
} {
  const founderItems = items.filter((item) => item.founderOnly);
  const status: FounderCapabilityStatus = founderItems.every((item) => item.status === "READY")
    ? "READY"
    : founderItems.some((item) => item.status === "BLOCKED")
      ? "BLOCKED"
      : founderItems.some((item) => item.status === "OPERATIONAL_WITH_APPROVAL")
        ? "OPERATIONAL_WITH_APPROVAL"
        : "PARTIAL";

  const blockers = founderItems.map((item) => item.reason).filter((reason): reason is string => Boolean(reason));
  return {
    status,
    blockers: Array.from(new Set(blockers)),
  };
}

export function createFounderReadinessReport(input: {
  certifications: WorkforceAgentCertification[];
  generatedAt?: string | Date;
  generatedBy?: string;
}): FounderReadinessReport {
  const agentMap = new Map<AiosAgentKey, WorkforceAgentCertification>(
    input.certifications.map((item) => [item.agent.key, item]),
  );
  const canonicalCapabilities = listMasonCapabilities();

  const evidenceBackedReports: FounderReadinessCapabilityReport[] = canonicalCapabilities.map((capability) => {
    const certification = agentMap.get(capability.agent);
    if (!certification) {
      return {
        capabilityId: capability.capabilityId,
        agent: AIOS_WORKFORCE.find((agent) => agent.key === capability.agent)!,
        founderOnly: isFounderOnlyAgent(capability.agent),
        capability,
        status: "BLOCKED",
        evidenceType: "missing_evidence",
        evidenceClass: "unknown",
        observedAt: new Date(input.generatedAt ?? Date.now()).toISOString(),
        observedBy: "mason.founder_readiness_report",
        reason: "missing_evidence",
        requiredAction: "Provide evidence",
      };
    }
    return toReportItem(certification, capability);
  });

  const founderSummary = summarizeFounderStatus(evidenceBackedReports);
  const generatedAt = input.generatedAt instanceof Date
    ? input.generatedAt.toISOString()
    : new Date(input.generatedAt ?? Date.now()).toISOString();

  return {
    generatedAt,
    generatedBy: input.generatedBy ?? "mason.founder_readiness_report",
    capabilityRegistryVersion: "1.0",
    canonicalPath: "workforce.certification",
    founderStatus: founderSummary.status,
    founderStatusLabel: FOUNDER_STATUS_LABELS[founderSummary.status],
    founderBlockers: founderSummary.blockers,
    capabilities: evidenceBackedReports,
  };
}

export function founderReadinessAgentCount(): number {
  return AIOS_WORKFORCE.length;
}
