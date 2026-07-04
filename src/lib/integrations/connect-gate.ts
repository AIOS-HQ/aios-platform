import "server-only";

import { getConnectorDefinition } from "@/lib/integrations/registry";
import { isDevConfigured } from "@/lib/integrations/registry-status";

/**
 * Connector Connect-gate (Stage 1c) — the ONE place that decides what Connect
 * affordance a connector tile may show, for EVERY connector, in both Founder
 * and Customer mode.
 *
 * The invariant: a live Connect action is never offered until the provider's
 * developer configuration is complete (`isDevConfigured`). Gated behind the
 * `CONNECTOR_GATE_ENABLED` flag so it can be enabled per environment and rolled
 * back instantly. Default ON (safe) unless explicitly set to "false".
 */

export function connectGateEnabled(): boolean {
  return process.env.CONNECTOR_GATE_ENABLED !== "false";
}

export type ConnectAffordance =
  /** Dev-configured + not connected: offer a live Connect. */
  | "connect"
  /** Connected but the token expired: offer Reconnect. */
  | "reauthorize"
  /** Connected and valid. */
  | "connected"
  /** Wired for OAuth but NOT dev-configured yet: gate the Connect (Founder sees a
   *  "finish setup" path to the Developer Platform; Customer simply won't see it). */
  | "finish_setup"
  /** No live connect flow wired for this provider yet. */
  | "coming_soon";

/**
 * Resolve the Connect affordance for a connector given its connection state.
 * Single source of truth for the tile action across all surfaces.
 */
export function connectAffordanceFor(
  connectorId: string,
  opts: { connected: boolean; expired: boolean },
): ConnectAffordance {
  const def = getConnectorDefinition(connectorId);
  if (!def) return "coming_soon";
  if (opts.connected) return opts.expired ? "reauthorize" : "connected";
  if (!def.authorizable) return "coming_soon";
  // The gate: never offer a live Connect until developer configuration is complete.
  if (connectGateEnabled() && !isDevConfigured(def)) return "finish_setup";
  return "connect";
}
