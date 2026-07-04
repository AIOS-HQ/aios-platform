import "server-only";

import { registerGitHubCapabilities } from "./github";

/**
 * Provider bootstrap. Idempotently registers every provider's capability
 * handlers on the Universal Capability Runtime. Call this before executing a
 * capability (or at the top of any surface that inspects handler wiring).
 *
 * Adding a provider = implement its handler module (mirroring ./github) and add
 * one registration call here. No other wiring is required — the runtime supplies
 * loading, discovery, permissions, retry, telemetry, diagnostics, and recovery.
 */

let done = false;

export function ensureProvidersRegistered(): void {
  if (done) return;
  done = true;
  registerGitHubCapabilities();
}
