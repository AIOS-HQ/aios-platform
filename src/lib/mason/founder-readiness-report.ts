import "server-only";

import type { AiosAgent, AiosAgentKey } from "@/lib/workforce/registry";
import { AIOS_WORKFORCE, isFounderOnlyAgent } from "@/lib/workforce/registry";
import {
  WORKFORCE_STATUS_LABELS,
  type WorkforceAgentCertification,
  type WorkforceCertificationStatus,
} from "@/lib/workforce/certification";
import { classifyMasonEvidenceType, listMasonCapabilityRecords } from "@/lib/mason/capability-registry";

export interface FounderReadinessAgentReport {
  agent: AiosAgent;
  founderOnly: boolean;
  status: WorkforceCertificationStatus;
  statusLabel: string;
  evidenceType: string;
  evidenceClass: "simulated" | "mocked" | "source_derived" | "live";
  observedAt: string;
  observedBy: string;
  blockers: string[];
}

export interface FounderReadinessReport {
  generatedAt: string;
  generatedBy: string;
  capabilityRegistryVersion: string;
  canonicalPath: "workforce.certification";
  founderStatus: WorkforceCertificationStatus;
  founderStatusLabel: string;
  founderBlockers: string[];
  agents: FounderReadinessAgentReport[];
}

function toReportItem(input: WorkforceAgentCertification): FounderReadinessAgentReport {
  return {
    agent: input.agent,
    founderOnly: isFounderOnlyAgent(input.agent.key),
    status: input.status,
    statusLabel: WORKFORCE_STATUS_LABELS[input.status],
    evidenceType: input.evidenceType,
    evidenceClass: classifyMasonEvidenceType(input.evidenceType),
    observedAt: input.observedAt,
    observedBy: input.observedBy,
    blockers: [...input.blockers],
  };
}

function summarizeFounderStatus(items: FounderReadinessAgentReport[]): {
  status: WorkforceCertificationStatus;
  blockers: string[];
} {
  const founderItems = items.filter((item) => item.founderOnly);
  const status: WorkforceCertificationStatus = founderItems.every((item) => item.status === "production_ready")
    ? "production_ready"
    : founderItems.some((item) => item.status === "blocked")
      ? "blocked"
      : founderItems.some((item) => item.status === "configuration_required")
        ? "configuration_required"
        : founderItems.some((item) => item.status === "operational_with_approval")
          ? "operational_with_approval"
          : founderItems.some((item) => item.status === "partial")
            ? "partial"
            : founderItems.some((item) => item.status === "metadata_only")
              ? "metadata_only"
              : founderItems.some((item) => item.status === "advisory_only")
                ? "advisory_only"
                : founderItems.some((item) => item.status === "unsupported")
                  ? "unsupported"
                  : "partial";

  const blockers = founderItems.flatMap((item) => item.blockers);
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
  const canonicalAgents = listMasonCapabilityRecords().map((record) => record.agentKey);

  const evidenceBackedReports: FounderReadinessAgentReport[] = canonicalAgents.map((agentKey) => {
    const certification = agentMap.get(agentKey);
    if (!certification) {
      throw new Error(`founder_readiness_missing_evidence:${agentKey}`);
    }
    return toReportItem(certification);
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
    founderStatusLabel: WORKFORCE_STATUS_LABELS[founderSummary.status],
    founderBlockers: founderSummary.blockers,
    agents: evidenceBackedReports,
  };
}

export function founderReadinessAgentCount(): number {
  return AIOS_WORKFORCE.length;
}

