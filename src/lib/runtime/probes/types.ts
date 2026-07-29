/**
 * Canonical Operational Runtime Probe contract (6C.1 Slice 1).
 *
 * UI-independent, observational types for normalizing runtime health signals
 * across existing AIOS sources (runtime execution, connector health,
 * diagnostics, activity, workforce signals). This module intentionally does not
 * fetch data, schedule probes, persist snapshots, or trigger remediation.
 */

/** Canonical probe categories for runtime signal normalization. */
export const PROBE_CATEGORIES = [
  "liveness",
  "readiness",
  "execution_health",
  "connector_health",
  "operational_activity",
  "freshness",
] as const;

export type ProbeCategory = (typeof PROBE_CATEGORIES)[number];

/**
 * Domain health semantics for a probe result.
 *
 * - `healthy`: source indicates normal operation for that domain.
 * - `degraded`: source indicates partial impairment/attention required.
 * - `failed`: source indicates hard failure in that domain.
 * - `unknown`: no trustworthy observation is currently available.
 */
export const PROBE_STATUSES = ["healthy", "degraded", "failed", "unknown"] as const;
export type ProbeStatus = (typeof PROBE_STATUSES)[number];

/**
 * Recency semantics independent from domain health.
 *
 * Freshness does not override domain status: a probe may be `healthy` yet `stale`.
 */
export const PROBE_FRESHNESS_STATES = ["fresh", "stale", "unknown"] as const;
export type ProbeFreshness = (typeof PROBE_FRESHNESS_STATES)[number];

/** Registered observational sources that can emit canonical probe results. */
export const PROBE_SOURCES = [
  "runtime_execution",
  "connector_health",
  "diagnostics",
  "agent_activity",
  "workforce_signals",
] as const;
export type ProbeSource = (typeof PROBE_SOURCES)[number];

/**
 * Tenant scope for probe visibility.
 *
 * `companyId` may be `null` only for user-scoped signals that are not tied to a
 * specific company context.
 */
export interface ProbeScope {
  userId: string;
  companyId: string | null;
}

/**
 * Safe evidence pointer for auditability.
 *
 * `ref` must be an opaque identifier/path and must not contain tokens,
 * credentials, or raw secret payloads.
 */
export interface ProbeEvidenceRef {
  source: ProbeSource;
  ref: string;
  observedAt: string;
}

/**
 * One normalized probe observation.
 *
 * Invariants:
 * - `unavailable === true` implies `status === "unknown"`.
 * - `observedAt === null` implies no trustworthy observation exists.
 * - when unavailable and no observation exists, freshness must be `unknown`.
 */
export interface RuntimeProbeResult {
  probeId: string;
  source: ProbeSource;
  category: ProbeCategory;
  status: ProbeStatus;
  summary: string;
  observedAt: string | null;
  freshness: ProbeFreshness;
  scope: ProbeScope;
  unavailable: boolean;
  reason?: string;
  recommendedAction?: string;
  evidence: ProbeEvidenceRef[];
}

export interface ProbeCategorySummary {
  category: ProbeCategory;
  status: ProbeStatus;
  total: number;
  healthy: number;
  degraded: number;
  failed: number;
  unknown: number;
  stale: number;
}

export interface RuntimeProbeSummary {
  status: ProbeStatus;
  generatedAt: string;
  scope: ProbeScope;
  probes: RuntimeProbeResult[];
  categories: ProbeCategorySummary[];
}

export function isProbeCategory(value: unknown): value is ProbeCategory {
  return typeof value === "string" && (PROBE_CATEGORIES as readonly string[]).includes(value);
}

export function isProbeStatus(value: unknown): value is ProbeStatus {
  return typeof value === "string" && (PROBE_STATUSES as readonly string[]).includes(value);
}

export function isProbeFreshness(value: unknown): value is ProbeFreshness {
  return typeof value === "string" && (PROBE_FRESHNESS_STATES as readonly string[]).includes(value);
}

export function isProbeSource(value: unknown): value is ProbeSource {
  return typeof value === "string" && (PROBE_SOURCES as readonly string[]).includes(value);
}

const STATUS_PRECEDENCE: Record<ProbeStatus, number> = {
  unknown: 0,
  healthy: 1,
  degraded: 2,
  failed: 3,
};

/**
 * Compare status severity for deterministic ordering and summary reduction.
 * Positive means `a` outranks `b`.
 */
export function compareProbeStatusPrecedence(a: ProbeStatus, b: ProbeStatus): number {
  return STATUS_PRECEDENCE[a] - STATUS_PRECEDENCE[b];
}

/** Higher-severity status wins (`failed > degraded > healthy > unknown`). */
export function maxProbeStatus(a: ProbeStatus, b: ProbeStatus): ProbeStatus {
  return compareProbeStatusPrecedence(a, b) >= 0 ? a : b;
}

/**
 * Constructor helper enforcing Slice 1 contract invariants.
 *
 * This helper is optional for callers, but when used it prevents invalid
 * unavailable/health/freshness combinations.
 */
export function createRuntimeProbeResult(input: RuntimeProbeResult): RuntimeProbeResult {
  if (input.unavailable && input.status !== "unknown") {
    throw new Error("Unavailable probe results must use status 'unknown'");
  }
  if (input.observedAt === null && input.unavailable && input.freshness !== "unknown") {
    throw new Error("Unavailable probe results with no observation must use freshness 'unknown'");
  }
  return input;
}
