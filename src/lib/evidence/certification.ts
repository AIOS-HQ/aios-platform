import {
  canSupportHealthyStatus,
  createEvidence,
  type CreateEvidenceInput,
  type EvidenceResult,
  type EvidenceStatus,
  type EvidenceType,
} from "@/lib/evidence/model";

/** Shared entry point for domain-specific certification results. */
export function createCertificationEvidence<TStatus extends string, TDetails>(
  input: CreateEvidenceInput<TStatus, TDetails>,
): EvidenceResult<TStatus, TDetails> {
  return createEvidence(input);
}

export interface CertificationCheckInput<TDetails> {
  /** true = passed, false = observed failure, null = outcome unavailable. */
  outcome: boolean | null;
  evidenceType: EvidenceType;
  observedBy: string;
  confidence: number;
  details: TDetails;
  observedAt?: string | Date;
  failureStatus?: Extract<EvidenceStatus, "degraded" | "blocked" | "unavailable">;
}

export interface CertifiedDiagnosticItem<TDetails = Record<string, unknown>>
  extends EvidenceResult<EvidenceStatus, TDetails> {
  id: string;
  ok: boolean;
  detail: string;
}

export interface CertifiedDiagnosticsResult<
  TItemDetails = Record<string, unknown>,
  TResultDetails = Record<string, unknown>,
> extends EvidenceResult<EvidenceStatus, TResultDetails> {
  connected: boolean;
  items: CertifiedDiagnosticItem<TItemDetails>[];
}

/**
 * Shared runtime-check certification utility.
 *
 * Source and documentation proof can establish that an implementation exists,
 * but cannot produce a healthy runtime result. Unknown evidence always remains
 * unknown. Callers supply a truthful failure status for observed failures.
 */
export function createCertificationResult<TDetails>(
  input: CertificationCheckInput<TDetails>,
): EvidenceResult<EvidenceStatus, TDetails> {
  let status: EvidenceStatus;
  if (input.evidenceType === "unknown" || input.outcome === null) {
    status = "unknown";
  } else if (input.outcome) {
    status = canSupportHealthyStatus(input.evidenceType) ? "healthy" : "degraded";
  } else {
    status = input.failureStatus ?? "degraded";
  }

  return createCertificationEvidence({
    status,
    evidenceType: input.evidenceType,
    observedBy: input.observedBy,
    confidence: input.confidence,
    details: input.details,
    observedAt: input.observedAt,
  });
}

export function createDiagnosticItem<TDetails>(input: {
  id: string;
  ok: boolean;
  detail: string;
  evidenceType: EvidenceType;
  observedBy: string;
  confidence: number;
  details: TDetails;
  observedAt?: string | Date;
  failureStatus?: Extract<EvidenceStatus, "degraded" | "blocked" | "unavailable">;
}): CertifiedDiagnosticItem<TDetails> {
  const result = createCertificationResult({
    outcome: input.ok,
    evidenceType: input.evidenceType,
    observedBy: input.observedBy,
    confidence: input.confidence,
    details: input.details,
    observedAt: input.observedAt,
    failureStatus: input.failureStatus,
  });
  return { id: input.id, ok: input.ok, detail: input.detail, ...result };
}

export function createDiagnosticsResult<TItemDetails, TResultDetails>(input: {
  connected: boolean;
  items: CertifiedDiagnosticItem<TItemDetails>[];
  evidenceType: EvidenceType;
  observedBy: string;
  confidence: number;
  details: TResultDetails;
  observedAt?: string | Date;
}): CertifiedDiagnosticsResult<TItemDetails, TResultDetails> {
  const outcome = !input.connected
    ? false
    : input.items.length === 0
      ? null
      : input.items.every((item) => item.ok);
  const result = createCertificationResult({
    outcome,
    evidenceType: input.evidenceType,
    observedBy: input.observedBy,
    confidence: input.confidence,
    details: input.details,
    observedAt: input.observedAt,
    failureStatus: input.connected ? "degraded" : "unavailable",
  });
  return { connected: input.connected, items: input.items, ...result };
}

export function evidenceTypeFromVercelTier(
  tier: string | null | undefined,
): EvidenceType {
  switch (tier) {
    case "direct_vercel_api":
      return "live_runtime_proof";
    case "github_vercel_deployment_status":
      return "authenticated_runtime_proof";
    case "runtime_deployment_identity":
      return "configuration_proof";
    default:
      return "unknown";
  }
}
