import type { RiskClass } from "@/lib/integrations/connectors";

/**
 * Universal Capability Runtime — shared types.
 *
 * The runtime is the single execution path every connector inherits. These
 * types define the contract: how a capability is referenced, executed, gated by
 * governance (risk class → permission), retried, and observed. No provider-
 * specific shapes appear here — specialization is data (the registry), not code.
 */

/** Governance requirement derived from a capability's mode + risk class. */
export type PermissionLevel = "autonomous" | "approval_required" | "destructive_approval";

export interface CapabilityRef {
  connectorId: string;
  capabilityId: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4000,
  jitter: true,
};

export interface CapabilityContext<I = unknown> {
  userId: string;
  connectorId: string;
  capabilityId: string;
  input: I;
  /**
   * Governance hook. For any non-autonomous capability the runtime calls this to
   * ask whether the action is authorized to run now (the approval itself is
   * owned by the Autonomy Spine — the runtime never creates a second approval
   * path). Absent hook ⇒ gated capabilities are held as requires_approval.
   */
  authorize?: (info: {
    ref: CapabilityRef;
    permission: PermissionLevel;
    risk: RiskClass;
  }) => boolean | Promise<boolean>;
  /** Optional per-call retry override. */
  retry?: Partial<RetryPolicy>;
  /** Correlation id threaded through telemetry + audit. */
  correlationId?: string;
}

export type CapabilityOutcome =
  | "success"
  | "requires_approval"
  | "not_configured"
  | "not_connected"
  | "not_implemented"
  | "error";

export interface CapabilityError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CapabilityResult<O = unknown> {
  outcome: CapabilityOutcome;
  connectorId: string;
  capabilityId: string;
  data?: O;
  error?: CapabilityError;
  attempts: number;
  durationMs: number;
  correlationId?: string;
}

/**
 * A capability handler performs the real provider call. Providers register
 * handlers with the runtime incrementally; the runtime supplies a valid access
 * token (for OAuth connectors) so handlers never touch the token layer directly.
 */
export type CapabilityHandler<I = unknown, O = unknown> = (args: {
  userId: string;
  connectorId: string;
  capabilityId: string;
  input: I;
  accessToken: string | null;
}) => Promise<O>;

export interface HealthStatus {
  connectorId: string;
  devConfigured: boolean;
  connected: boolean;
  expired: boolean;
  gaps: string[];
  detail: string;
}

export interface TelemetryEvent {
  type: "capability_invocation";
  connectorId: string;
  capabilityId: string;
  userId: string;
  outcome: CapabilityOutcome;
  attempts: number;
  durationMs: number;
  correlationId?: string;
  at: string;
}

/** Pluggable sink for telemetry / usage analytics / audit (persistent store wired later). */
export interface TelemetrySink {
  record(event: TelemetryEvent): void | Promise<void>;
}
