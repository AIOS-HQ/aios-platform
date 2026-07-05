import "server-only";

import { registerGitHubCapabilities } from "./github";
import { registerSlackCapabilities } from "./slack";

/**
 * Provider bootstrap. Idempotently registers every provider's capability
 * handlers on the Universal Capability Runtime. Call before executing a
 * capability (or at the top of any surface that inspects handler wiring).
 *
 * Adding a provider = implement its handler module (mirroring ./github) and add
 * one registration call here. No other wiring is required.
 */

let done = false;

export function ensureProvidersRegistered(): void {
  if (done) return;
  done = true;
  registerGitHubCapabilities();
  registerSlackCapabilities();
}
