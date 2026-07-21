/**
 * Canonical AIOS evidence model.
 *
 * Evidence describes what was actually observed, independently from the domain
 * being certified. Callers may retain their existing domain status values, but
 * every certification result must carry these fields so consumers can
 * distinguish live proof from source or documentation claims.
 */

export const EVIDENCE_TYPES = [
  "live_runtime_proof",
  "authenticated_runtime_proof",
  "configuration_proof",
  "source_code_proof",
  "documentation_only",
  "unknown",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export type EvidenceStatus =
  | "healthy"
  | "degraded"
  | "blocked"
  | "unavailable"
  | "unknown";

export interface EvidenceMetadata<TDetails = Record<string, unknown>> {
  evidenceType: EvidenceType;
  observedAt: string;
  observedBy: string;
  /** Normalized confidence from 0 (none) to 1 (direct proof). */
  confidence: number;
  details: TDetails;
}

export type EvidenceResult<
  TStatus extends string = EvidenceStatus,
  TDetails = Record<string, unknown>,
> = EvidenceMetadata<TDetails> & {
  status: TStatus;
};

export interface CreateEvidenceInput<
  TStatus extends string,
  TDetails,
> {
  status: TStatus;
  evidenceType: EvidenceType;
  observedBy: string;
  confidence: number;
  details: TDetails;
  observedAt?: string | Date;
}

const RUNTIME_HEALTH_EVIDENCE = new Set<EvidenceType>([
  "live_runtime_proof",
  "authenticated_runtime_proof",
  "configuration_proof",
]);

export function canSupportHealthyStatus(evidenceType: EvidenceType): boolean {
  return RUNTIME_HEALTH_EVIDENCE.has(evidenceType);
}

/**
 * The single constructor for canonical evidence.
 *
 * It rejects ambiguous timestamps, invalid confidence, missing observers, and
 * healthy claims backed only by source, documentation, or unknown evidence.
 */
export function createEvidence<TStatus extends string, TDetails>(
  input: CreateEvidenceInput<TStatus, TDetails>,
): EvidenceResult<TStatus, TDetails> {
  const observedBy = input.observedBy.trim();
  if (!observedBy) throw new Error("Evidence observedBy is required.");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new Error("Evidence confidence must be between 0 and 1.");
  }

  const observedAt = input.observedAt instanceof Date
    ? input.observedAt
    : new Date(input.observedAt ?? Date.now());
  if (Number.isNaN(observedAt.getTime())) throw new Error("Evidence observedAt must be a valid timestamp.");

  if (input.status === "healthy" && !canSupportHealthyStatus(input.evidenceType)) {
    throw new Error(`Evidence type ${input.evidenceType} cannot support a healthy runtime status.`);
  }

  return {
    status: input.status,
    evidenceType: input.evidenceType,
    observedAt: observedAt.toISOString(),
    observedBy,
    confidence: input.confidence,
    details: input.details,
  };
}
