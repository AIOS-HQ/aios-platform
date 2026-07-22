import {
  createCertificationEvidence,
} from "@/lib/evidence/certification";
import type { EvidenceMetadata } from "@/lib/evidence/model";
import type { RuntimeIdentity } from "@/lib/runtime-identity/model";
import {
  AIOS_WORKFORCE,
  type AiosAgentKey,
} from "@/lib/workforce/registry";

export type AgentRuntimeMode =
  | "shared_provider_runtime"
  | "deterministic_runtime"
  | "hybrid_shared_deterministic_runtime"
  | "unsupported"
  | "unavailable";

export interface AgentRuntimeMapping
  extends EvidenceMetadata<{
    scope: "agent_runtime_mapping";
    providerEvidenceType: RuntimeIdentity["evidenceType"];
    dedicatedDeploymentVerified: false;
  }> {
  status: "degraded";
  agentKey: AiosAgentKey;
  agentName: string;
  runtimeMode: AgentRuntimeMode;
  primaryExecution: "shared_provider" | "deterministic";
  sharedProviderRuntimeId: string | null;
  deterministicRuntimeId: string;
  deterministicCapabilities: string[];
  modelBackedCapabilities: string[];
  externalRuntimeStatus: "not_declared" | "externally_configured_unverified";
  safeMessage: string;
}

const MAPPING_SPECS: Record<AiosAgentKey, {
  primaryExecution: AgentRuntimeMapping["primaryExecution"];
  deterministicCapabilities: string[];
  modelBackedCapabilities: string[];
  externalRuntimeStatus?: AgentRuntimeMapping["externalRuntimeStatus"];
}> = {
  harmony: {
    primaryExecution: "shared_provider",
    deterministicCapabilities: ["task_routing", "approval_routing", "workforce_coordination"],
    modelBackedCapabilities: ["operator_conversation", "agent_conversation"],
  },
  auditor: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["read_only_audit", "governance_sweep", "risk_posture"],
    modelBackedCapabilities: ["agent_conversation"],
  },
  mason: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["runtime_readiness", "execution_planning", "approval_gating"],
    modelBackedCapabilities: ["agent_conversation"],
    externalRuntimeStatus: "externally_configured_unverified",
  },
  catalyst: {
    primaryExecution: "shared_provider",
    deterministicCapabilities: ["content_work_item_preparation", "publishing_approval_routing"],
    modelBackedCapabilities: ["content_generation", "agent_conversation"],
  },
  ambassador: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["communication_risk_classification", "approval_routing"],
    modelBackedCapabilities: ["response_drafting", "agent_conversation"],
  },
  atlas: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["julius_retrieval", "knowledge_curation", "skill_promotion"],
    modelBackedCapabilities: ["agent_conversation"],
  },
  pulse: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["connector_health_read", "audit_summary", "alert_routing"],
    modelBackedCapabilities: ["agent_conversation"],
  },
  horizon: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["adaptive_planning", "goal_tracking", "work_item_creation"],
    modelBackedCapabilities: ["agent_conversation"],
  },
  aegis: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["risk_classification", "secret_redaction", "autonomy_review"],
    modelBackedCapabilities: ["agent_conversation"],
  },
  ledger: {
    primaryExecution: "deterministic",
    deterministicCapabilities: ["approval_history", "audit_trail", "activity_history"],
    modelBackedCapabilities: ["agent_conversation"],
  },
};

export function getAgentRuntimeMappings(
  providerIdentity: RuntimeIdentity,
  observedAt?: string | Date,
): AgentRuntimeMapping[] {
  const sharedProviderRuntimeId = providerIdentity.sharedOrDedicated === "shared"
    ? providerIdentity.runtimeId
    : null;

  return AIOS_WORKFORCE.map((agent) => {
    const spec = MAPPING_SPECS[agent.key];
    const evidence = createCertificationEvidence({
      status: "degraded" as const,
      evidenceType: "source_code_proof",
      observedAt,
      observedBy: "runtime_identity.agent_mapping",
      confidence: 1,
      details: {
        scope: "agent_runtime_mapping" as const,
        providerEvidenceType: providerIdentity.evidenceType,
        dedicatedDeploymentVerified: false as const,
      },
    });
    return {
      ...evidence,
      agentKey: agent.key,
      agentName: agent.name,
      runtimeMode: "hybrid_shared_deterministic_runtime" as const,
      primaryExecution: spec.primaryExecution,
      sharedProviderRuntimeId,
      deterministicRuntimeId: `aios.runtime.deterministic.${agent.key}`,
      deterministicCapabilities: spec.deterministicCapabilities,
      modelBackedCapabilities: spec.modelBackedCapabilities,
      externalRuntimeStatus: spec.externalRuntimeStatus ?? "not_declared",
      safeMessage: sharedProviderRuntimeId
        ? "source_mapping_with_shared_provider_identity"
        : "source_mapping_provider_runtime_unavailable",
    };
  });
}

export function hasCompleteCanonicalRuntimeMappings(): boolean {
  return AIOS_WORKFORCE.every((agent) => Boolean(MAPPING_SPECS[agent.key]));
}
