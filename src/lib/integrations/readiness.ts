import type { ConnectorDefinition } from "@/lib/integrations/registry";
import type { NormalizedConnectorCapability, NormalizedConnectorHealth } from "@/lib/integrations/connector-health";
import { hasSelfTestProbe } from "@/lib/integrations/self-test-probes";

export type IntegrationClassification =
  | "production_ready"
  | "partial"
  | "read_only"
  | "configuration_required"
  | "reauthorization_required"
  | "framework_only"
  | "unsupported";

export const INTEGRATION_CLASSIFICATION_LABELS: Record<IntegrationClassification, string> = {
  production_ready: "Production-ready",
  partial: "Partially implemented",
  read_only: "Read-only",
  configuration_required: "Configuration required",
  reauthorization_required: "Reauthorization required",
  framework_only: "Framework only",
  unsupported: "Unsupported",
};

export const INTEGRATION_CLASSIFICATION_DESCRIPTIONS: Record<IntegrationClassification, string> = {
  production_ready: "Real authentication, identity, health, diagnostics, and implemented capabilities are available.",
  partial: "Some real capabilities exist, but important workflow pieces remain incomplete.",
  read_only: "Real read or identity capability exists; write behavior is unavailable here.",
  configuration_required: "Code exists, but credentials, scopes, connection, or external setup is missing.",
  reauthorization_required: "Stored credentials are expired, invalid, insufficiently scoped, or legacy.",
  framework_only: "Catalog metadata or OAuth scaffolding exists without meaningful runtime capability.",
  unsupported: "No usable implementation exists and execution is disabled.",
};

const SOCIAL_RUNTIME_CAPABILITIES: Record<string, Set<string>> = {
  linkedin: new Set(["read_profile", "verify_identity"]),
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

const SOCIAL_CAPABILITY_NOTES: Record<string, string> = {
  linkedin: "LinkedIn Sign-In is identity-only. LinkedIn Publisher remains the separate Founder-approved Social provider.",
  x: "X publishing executes through Harmony Social with Founder approval, idempotency, and duplicate prevention.",
  youtube: "YouTube publishing executes through Harmony Social with Founder approval, resumable upload, scheduling, and channel selection.",
};

const capabilityLabel = (id: string) =>
  id
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (m) => m.toUpperCase());

function externallyImplemented(provider: string, cap: NormalizedConnectorCapability): boolean {
  return SOCIAL_RUNTIME_CAPABILITIES[provider]?.has(cap.id) ?? false;
}

export interface IntegrationReadiness {
  classification: IntegrationClassification;
  classificationLabel: string;
  classificationDescription: string;
  implementedCapabilities: string[];
  unavailableCapabilities: string[];
  founderActions: string[];
  diagnostics: string[];
  selfTestAvailable: boolean;
  implementedReadCount: number;
  implementedWriteCount: number;
  declaredReadCount: number;
  declaredWriteCount: number;
}

export function assessIntegrationReadiness(
  def: ConnectorDefinition,
  health: NormalizedConnectorHealth,
): IntegrationReadiness {
  const implemented = health.capabilityDetails.filter((cap) => cap.implemented || externallyImplemented(def.id, cap));
  const unavailable = health.capabilityDetails.filter((cap) => !cap.implemented && !externallyImplemented(def.id, cap));
  const implementedReadCount = implemented.filter((cap) => cap.mode === "read").length;
  const implementedWriteCount = implemented.filter((cap) => cap.mode === "write").length;
  const declaredReadCount = health.capabilityDetails.filter((cap) => cap.mode === "read").length;
  const declaredWriteCount = health.capabilityDetails.filter((cap) => cap.mode === "write").length;

  const founderActions = [
    ...health.blockers,
    ...(!health.configured && def.requiredEnv.length > 0
      ? [`Set required environment variables: ${def.requiredEnv.join(", ")}.`]
      : []),
    ...(def.auth === "oauth2" && health.configured && !health.connected
      ? ["Connect or reconnect this provider from the Integration Center."]
      : []),
  ];

  let classification: IntegrationClassification;
  if (def.capabilities.length === 0 && !def.authorizable) {
    classification = "framework_only";
  } else if (health.connected && health.token.expired && !health.token.refreshable) {
    classification = "reauthorization_required";
  } else if (health.connected && health.grantedScopes.length > 0 && health.blockers.some((b) => /scope|reconnect/i.test(b))) {
    classification = "reauthorization_required";
  } else if (implemented.length === 0) {
    classification = def.capabilities.length > 0 ? "framework_only" : "unsupported";
  } else if (!health.configured || (def.auth === "oauth2" && !health.connected)) {
    classification = "configuration_required";
  } else if (implementedWriteCount === 0 && implementedReadCount > 0) {
    classification = "read_only";
  } else if (unavailable.length > 0 || health.warnings.length > 0) {
    classification = "partial";
  } else if (health.healthy) {
    classification = "production_ready";
  } else {
    classification = "partial";
  }

  const diagnostics = [
    ...health.warnings,
    ...(SOCIAL_CAPABILITY_NOTES[def.id] ? [SOCIAL_CAPABILITY_NOTES[def.id]] : []),
  ];

  return {
    classification,
    classificationLabel: INTEGRATION_CLASSIFICATION_LABELS[classification],
    classificationDescription: INTEGRATION_CLASSIFICATION_DESCRIPTIONS[classification],
    implementedCapabilities: implemented.map((cap) => capabilityLabel(cap.id)),
    unavailableCapabilities: unavailable.map((cap) => capabilityLabel(cap.id)),
    founderActions: Array.from(new Set(founderActions)),
    diagnostics: Array.from(new Set(diagnostics)),
    selfTestAvailable: hasSelfTestProbe(def.id),
    implementedReadCount,
    implementedWriteCount,
    declaredReadCount,
    declaredWriteCount,
  };
}
