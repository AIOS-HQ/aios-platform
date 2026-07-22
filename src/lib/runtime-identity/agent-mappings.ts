import "server-only";

import {
  createCertificationEvidence,
} from "@/lib/evidence/certification";
import type { EvidenceMetadata, EvidenceStatus, EvidenceType } from "@/lib/evidence/model";
import type { RuntimeIdentity } from "@/lib/runtime-identity/model";
import { WORKFORCE_RUNTIME_CONTRACTS } from "@/lib/workforce/certification";
import {
  AIOS_WORKFORCE,
  type AiosAgentKey,
  isFounderOnlyAgent,
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
    modelRuntimeEvidenceType: EvidenceType;
    deterministicEvidenceType: "source_code_proof";
    dedicatedDeploymentVerified: false;
    agentProbeAttempted: boolean;
  }> {
  status: EvidenceStatus;
  agentKey: AiosAgentKey;
  agentName: string;
  runtimeMode: AgentRuntimeMode;
  primaryExecution: "shared_provider" | "deterministic";
  executionCapability: "real_runtime" | "guided_runtime" | "advisory" | "none";
  sharedProviderRuntimeId: string | null;
  deterministicRuntimeId: string;
  deterministicCapabilities: string[];
  modelBackedCapabilities: string[];
  unverifiedCapabilities: string[];
  blockedCapabilities: string[];
  unsupportedCapabilities: string[];
  approvalRequirements: string[];
  safetyBoundaries: string[];
  modelRuntimeStatus:
    | "healthy"
    | "failed"
    | "configuration_missing"
    | "runtime_unavailable"
    | "not_probed";
  deploymentIdentity: {
    provider: string | null;
    runtimeId: string | null;
    model: string | null;
    deploymentName: string | null;
    endpointHostname: string | null;
    sharedOrDedicated: RuntimeIdentity["sharedOrDedicated"];
  };
  externalRuntimeStatus: "not_declared" | "externally_configured_unverified";
  safeMessage: string;
}

export type AgentRuntimeProofs = Partial<Record<AiosAgentKey, RuntimeIdentity>>;

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
  runtimeProofs: AgentRuntimeProofs = {},
): AgentRuntimeMapping[] {
  const sharedProviderRuntimeId = providerIdentity.sharedOrDedicated === "shared"
    ? providerIdentity.runtimeId
    : null;

  return AIOS_WORKFORCE.map((agent) => {
    const spec = MAPPING_SPECS[agent.key];
    const contract = WORKFORCE_RUNTIME_CONTRACTS[agent.key];
    const proof = runtimeProofs[agent.key];
    const probeAttempted = Boolean(proof?.details.inferenceAttempted);
    const liveProof = Boolean(
      proof &&
      proof.inferenceStatus === "healthy" &&
      ["authenticated_runtime_proof", "live_runtime_proof"].includes(proof.evidenceType),
    );
    const providerUnavailable = providerIdentity.sharedOrDedicated !== "shared";
    const modelRuntimeStatus: AgentRuntimeMapping["modelRuntimeStatus"] = liveProof
      ? "healthy"
      : proof?.details.inferenceAttempted
        ? "failed"
        : providerIdentity.configurationStatus === "incomplete"
          ? "configuration_missing"
          : providerUnavailable
            ? "runtime_unavailable"
            : "not_probed";
    const blockedCapabilities = ["failed", "configuration_missing", "runtime_unavailable"].includes(
      modelRuntimeStatus,
    )
      ? [...spec.modelBackedCapabilities]
      : [];
    const unverifiedCapabilities = modelRuntimeStatus === "not_probed"
      ? [...spec.modelBackedCapabilities]
      : [];
    const status: EvidenceStatus = liveProof
      ? "healthy"
      : modelRuntimeStatus === "runtime_unavailable" && spec.primaryExecution === "shared_provider"
          ? "unavailable"
          : blockedCapabilities.length > 0 && spec.primaryExecution === "shared_provider"
            ? "blocked"
          : "degraded";
    const evidenceType = liveProof || probeAttempted
      ? proof!.evidenceType
      : "source_code_proof";
    const evidence = createCertificationEvidence({
      status,
      evidenceType,
      observedAt,
      observedBy: proof?.observedBy ?? "runtime_identity.agent_mapping",
      confidence: liveProof ? proof!.confidence : probeAttempted ? 0.9 : 0.7,
      details: {
        scope: "agent_runtime_mapping" as const,
        providerEvidenceType: providerIdentity.evidenceType,
        modelRuntimeEvidenceType: proof?.evidenceType ?? "unknown",
        deterministicEvidenceType: "source_code_proof" as const,
        dedicatedDeploymentVerified: false as const,
        agentProbeAttempted: probeAttempted,
      },
    });
    return {
      ...evidence,
      agentKey: agent.key,
      agentName: agent.name,
      runtimeMode: "hybrid_shared_deterministic_runtime" as const,
      primaryExecution: spec.primaryExecution,
      executionCapability: contract.executionCapability,
      sharedProviderRuntimeId,
      deterministicRuntimeId: `aios.runtime.deterministic.${agent.key}`,
      deterministicCapabilities: spec.deterministicCapabilities,
      modelBackedCapabilities: spec.modelBackedCapabilities,
      unverifiedCapabilities,
      blockedCapabilities,
      unsupportedCapabilities: [...contract.unsupportedCapabilities],
      approvalRequirements: [contract.approvalPolicy],
      safetyBoundaries: [
        contract.autonomyPolicy,
        "Agent certification probes are fixed, read-only, non-persisting, and cannot execute tools.",
        "Company and Founder access boundaries remain enforced outside the shared model transport.",
        ...(isFounderOnlyAgent(agent.key) ? ["Founder-only agent surface."] : []),
      ],
      modelRuntimeStatus,
      deploymentIdentity: {
        provider: providerIdentity.provider,
        runtimeId: sharedProviderRuntimeId,
        model: providerIdentity.model,
        deploymentName: providerIdentity.deploymentName,
        endpointHostname: providerIdentity.endpointHostname,
        sharedOrDedicated: providerIdentity.sharedOrDedicated,
      },
      externalRuntimeStatus: spec.externalRuntimeStatus ?? "not_declared",
      safeMessage: liveProof
        ? "agent_shared_model_runtime_probe_succeeded"
        : probeAttempted
          ? "agent_shared_model_runtime_probe_failed"
          : sharedProviderRuntimeId
            ? "agent_runtime_mapping_not_live_probed"
            : "agent_runtime_mapping_provider_unavailable",
    };
  });
}

export function hasCompleteCanonicalRuntimeMappings(): boolean {
  return AIOS_WORKFORCE.every((agent) => Boolean(MAPPING_SPECS[agent.key]));
}
