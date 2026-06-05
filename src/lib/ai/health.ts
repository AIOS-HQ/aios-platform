/**
 * Lightweight, in-memory provider health signal. Best-effort (per server
 * instance) — persistent failure visibility comes from the activity feed, which
 * the execution layer writes to on provider errors. This module gives a cheap
 * status read + a "degraded" flag after repeated failures.
 */
export type ProviderCall = {
  provider: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type ProviderHealth = {
  last: (ProviderCall & { at: string }) | null;
  consecutiveFailures: number;
  /** True after 3+ consecutive failures — a hint to back off / alert. */
  degraded: boolean;
};

const DEGRADED_THRESHOLD = 3;

let last: (ProviderCall & { at: string }) | null = null;
let consecutiveFailures = 0;

export function recordProviderCall(call: ProviderCall): void {
  last = { ...call, at: new Date().toISOString() };
  consecutiveFailures = call.ok ? 0 : consecutiveFailures + 1;
}

export function getProviderHealth(): ProviderHealth {
  return {
    last,
    consecutiveFailures,
    degraded: consecutiveFailures >= DEGRADED_THRESHOLD,
  };
}

/** Test/util: reset the in-memory health state. */
export function resetProviderHealth(): void {
  last = null;
  consecutiveFailures = 0;
}
