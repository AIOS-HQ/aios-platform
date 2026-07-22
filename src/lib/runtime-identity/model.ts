import { createCertificationEvidence } from "@/lib/evidence/certification";
import type {
  EvidenceMetadata,
  EvidenceStatus,
  EvidenceType,
} from "@/lib/evidence/model";

export const RUNTIME_TYPES = [
  "azure_foundry",
  "azure_openai",
  "openai",
  "shared_provider",
  "deterministic",
  "unsupported",
  "unavailable",
] as const;

export type RuntimeType = (typeof RUNTIME_TYPES)[number];

export const PROVIDER_DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
} as const;

export type RuntimeConfigurationStatus =
  | "complete"
  | "incomplete"
  | "misconfigured"
  | "unsupported"
  | "unavailable";

export type RuntimeInferenceStatus =
  | "healthy"
  | "failed"
  | "timeout"
  | "not_probed"
  | "not_applicable"
  | "unavailable";

export type RuntimeAllocation =
  | "shared"
  | "dedicated"
  | "deterministic"
  | "unavailable";

export type RuntimeLatencyBucket =
  | "under_1s"
  | "1s_to_3s"
  | "3s_to_10s"
  | "over_10s"
  | null;

export interface RuntimeIdentityFields {
  runtimeId: string;
  runtimeType: RuntimeType;
  provider: string | null;
  model: string | null;
  deploymentName: string | null;
  modelVersion: string | null;
  endpointHostname: string | null;
  sharedOrDedicated: RuntimeAllocation;
  configurationStatus: RuntimeConfigurationStatus;
  inferenceStatus: RuntimeInferenceStatus;
  latencyBucket: RuntimeLatencyBucket;
  safeErrorCode: string | null;
  safeMessage: string;
}

export interface RuntimeIdentityEvidenceDetails {
  scope: "provider_runtime_identity";
  providerExplicit: boolean;
  modelSource: "explicit" | "source_fallback" | "deployment" | "none";
  authenticationConfigured: boolean;
  endpointConfigured: boolean;
  inferenceAttempted: boolean;
}

export interface RuntimeIdentity
  extends RuntimeIdentityFields,
    EvidenceMetadata<RuntimeIdentityEvidenceDetails> {
  status: EvidenceStatus;
}

export function createRuntimeIdentity(input: {
  fields: RuntimeIdentityFields;
  status: EvidenceStatus;
  evidenceType: EvidenceType;
  observedAt?: string | Date;
  observedBy: string;
  confidence: number;
  details: RuntimeIdentityEvidenceDetails;
}): RuntimeIdentity {
  const evidence = createCertificationEvidence({
    status: input.status,
    evidenceType: input.evidenceType,
    observedAt: input.observedAt,
    observedBy: input.observedBy,
    confidence: input.confidence,
    details: input.details,
  });
  return { ...input.fields, ...evidence };
}

export function runtimeIdentityFields(identity: RuntimeIdentity): RuntimeIdentityFields {
  return {
    runtimeId: identity.runtimeId,
    runtimeType: identity.runtimeType,
    provider: identity.provider,
    model: identity.model,
    deploymentName: identity.deploymentName,
    modelVersion: identity.modelVersion,
    endpointHostname: identity.endpointHostname,
    sharedOrDedicated: identity.sharedOrDedicated,
    configurationStatus: identity.configurationStatus,
    inferenceStatus: identity.inferenceStatus,
    latencyBucket: identity.latencyBucket,
    safeErrorCode: identity.safeErrorCode,
    safeMessage: identity.safeMessage,
  };
}
