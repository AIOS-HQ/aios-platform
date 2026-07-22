import "server-only";

import { createHash } from "node:crypto";
import {
  createCertificationEvidence,
} from "@/lib/evidence/certification";
import type {
  EvidenceMetadata,
  EvidenceStatus,
  EvidenceType,
} from "@/lib/evidence/model";
import type { RuntimeIdentity } from "@/lib/runtime-identity/model";

export const OPERATIONAL_RUNTIME_COMPONENTS = [
  "harmony_orchestration",
  "julius_retrieval",
  "connector_runtime",
  "approval_runtime",
  "supabase_runtime",
  "event_mesh_runtime",
] as const;

export type OperationalRuntimeComponent =
  (typeof OPERATIONAL_RUNTIME_COMPONENTS)[number];

export type OperationalRuntimeMode =
  | "hybrid"
  | "authenticated_service"
  | "deterministic"
  | "event_transport";

export interface RuntimeConditionSnapshot {
  conditionId: string;
  logicVersion: string;
  runtimeId: string;
  runtimeType: RuntimeIdentity["runtimeType"];
  provider: string | null;
  model: string | null;
  deploymentName: string | null;
  endpointHostname: string | null;
  sharedOrDedicated: RuntimeIdentity["sharedOrDedicated"];
  configurationStatus: RuntimeIdentity["configurationStatus"];
  providerExplicit: boolean;
  modelSource: RuntimeIdentity["details"]["modelSource"];
  authenticationConfigured: boolean;
  endpointConfigured: boolean;
  deploymentEnvironment: string | null;
  deploymentSha: string | null;
}

export interface RuntimeCertificationSnapshot {
  conditionId: string;
  outcomeId: string;
}

export interface RuntimeCertificationComparison {
  status:
    | "consistent"
    | "verified_configuration_difference"
    | "unexplained_runtime_divergence";
  conditionMatches: boolean;
  outcomeMatches: boolean;
  safeMessage: string;
}

export interface OperationalRuntimeCertification
  extends EvidenceMetadata<{
    scope: "operational_runtime";
    liveProbeRequired: boolean;
    liveProbeAttempted: boolean;
  }> {
  component: OperationalRuntimeComponent;
  status: EvidenceStatus;
  runtimeMode: OperationalRuntimeMode;
  capabilities: readonly string[];
  runtimeConditionId: string | null;
  safeErrorCode: string | null;
  safeMessage: string;
}

export interface OperationalRuntimeContract {
  component: OperationalRuntimeComponent;
  runtimeMode: OperationalRuntimeMode;
  capabilities: readonly string[];
}

export const OPERATIONAL_RUNTIME_CONTRACTS: Record<
  OperationalRuntimeComponent,
  OperationalRuntimeContract
> = {
  harmony_orchestration: {
    component: "harmony_orchestration",
    runtimeMode: "hybrid",
    capabilities: ["routing", "delegation", "work_coordination"],
  },
  julius_retrieval: {
    component: "julius_retrieval",
    runtimeMode: "authenticated_service",
    capabilities: ["company_scoped_retrieval", "permission_enforcement"],
  },
  connector_runtime: {
    component: "connector_runtime",
    runtimeMode: "authenticated_service",
    capabilities: ["capability_registration", "readiness", "safe_execution"],
  },
  approval_runtime: {
    component: "approval_runtime",
    runtimeMode: "deterministic",
    capabilities: ["read_visibility", "policy_gate", "decision_enforcement"],
  },
  supabase_runtime: {
    component: "supabase_runtime",
    runtimeMode: "authenticated_service",
    capabilities: ["connectivity", "tenant_isolation", "rls_enforcement"],
  },
  event_mesh_runtime: {
    component: "event_mesh_runtime",
    runtimeMode: "event_transport",
    capabilities: ["health", "dispatch", "consumer_delivery"],
  },
};

/**
 * Creates a comparison-safe identifier from allowlisted runtime identity fields
 * only. Secrets, URLs, headers, prompts, responses, and customer data are never
 * inputs. Environment and deployment SHA are reported separately so equivalent
 * Preview/Production configurations can be compared across squash merges.
 */
export function createRuntimeConditionSnapshot(input: {
  identity: RuntimeIdentity;
  logicVersion: string;
  deploymentEnvironment?: string | null;
  deploymentSha?: string | null;
}): RuntimeConditionSnapshot {
  const safeCondition = {
    logicVersion: input.logicVersion,
    runtimeId: input.identity.runtimeId,
    runtimeType: input.identity.runtimeType,
    provider: input.identity.provider,
    model: input.identity.model,
    deploymentName: input.identity.deploymentName,
    endpointHostname: input.identity.endpointHostname,
    sharedOrDedicated: input.identity.sharedOrDedicated,
    configurationStatus: input.identity.configurationStatus,
    providerExplicit: input.identity.details.providerExplicit,
    modelSource: input.identity.details.modelSource,
    authenticationConfigured: input.identity.details.authenticationConfigured,
    endpointConfigured: input.identity.details.endpointConfigured,
  };
  return {
    conditionId: createHash("sha256")
      .update(JSON.stringify(safeCondition))
      .digest("hex"),
    ...safeCondition,
    deploymentEnvironment: input.deploymentEnvironment ?? null,
    deploymentSha: input.deploymentSha ?? null,
  };
}

/** Creates a comparison identifier from normalized, safe outcome metadata. */
export function createRuntimeOutcomeId(input: {
  conditionId: string;
  status: EvidenceStatus;
  safeErrorCode: string | null;
  consumerOutcomes: readonly {
    key: string;
    status: EvidenceStatus;
    safeErrorCode: string | null;
  }[];
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * Cross-environment comparison is explicit: configuration differences explain
 * different outcomes; matching conditions with different outcomes are never
 * silently accepted.
 */
export function compareRuntimeCertificationSnapshots(
  first: RuntimeCertificationSnapshot,
  second: RuntimeCertificationSnapshot,
): RuntimeCertificationComparison {
  const conditionMatches = first.conditionId === second.conditionId;
  const outcomeMatches = first.outcomeId === second.outcomeId;
  if (!conditionMatches) {
    return {
      status: "verified_configuration_difference",
      conditionMatches,
      outcomeMatches,
      safeMessage: "runtime_certification_configuration_differs",
    };
  }
  if (!outcomeMatches) {
    return {
      status: "unexplained_runtime_divergence",
      conditionMatches,
      outcomeMatches,
      safeMessage: "runtime_certification_outcome_diverged",
    };
  }
  return {
    status: "consistent",
    conditionMatches,
    outcomeMatches,
    safeMessage: "runtime_certification_results_match",
  };
}

export function createOperationalRuntimeCertification(input: {
  component: OperationalRuntimeComponent;
  status: EvidenceStatus;
  evidenceType: EvidenceType;
  observedBy: string;
  confidence: number;
  observedAt?: string | Date;
  liveProbeRequired: boolean;
  liveProbeAttempted: boolean;
  runtimeConditionId?: string | null;
  safeErrorCode?: string | null;
  safeMessage: string;
}): OperationalRuntimeCertification {
  if (
    input.status === "healthy" &&
    (!input.liveProbeAttempted ||
      !["authenticated_runtime_proof", "live_runtime_proof"].includes(input.evidenceType))
  ) {
    throw new Error("Operational runtime health requires a successful live probe.");
  }
  const contract = OPERATIONAL_RUNTIME_CONTRACTS[input.component];
  const evidence = createCertificationEvidence({
    status: input.status,
    evidenceType: input.evidenceType,
    observedBy: input.observedBy,
    confidence: input.confidence,
    observedAt: input.observedAt,
    details: {
      scope: "operational_runtime" as const,
      liveProbeRequired: input.liveProbeRequired,
      liveProbeAttempted: input.liveProbeAttempted,
    },
  });
  return {
    ...evidence,
    component: input.component,
    runtimeMode: contract.runtimeMode,
    capabilities: contract.capabilities,
    runtimeConditionId: input.runtimeConditionId ?? null,
    safeErrorCode: input.safeErrorCode ?? null,
    safeMessage: input.safeMessage,
  };
}

/** Source-backed contracts only; these are deliberately not runtime health. */
export function getOperationalRuntimeFoundation(
  observedAt?: string | Date,
): OperationalRuntimeCertification[] {
  return OPERATIONAL_RUNTIME_COMPONENTS.map((component) =>
    createOperationalRuntimeCertification({
      component,
      status: "unknown",
      evidenceType: "source_code_proof",
      observedBy: "operational_runtime.foundation",
      confidence: 0.7,
      observedAt,
      liveProbeRequired: true,
      liveProbeAttempted: false,
      safeMessage: "operational_runtime_probe_not_implemented",
    }));
}
