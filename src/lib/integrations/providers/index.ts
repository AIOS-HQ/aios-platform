import "server-only";

import { registerGitHubCapabilities } from "./github";
import { registerSlackCapabilities } from "./slack";
import { registerNotionCapabilities } from "./notion";
import { registerLinearCapabilities } from "./linear";
import { registerDiscordCapabilities } from "./discord";
import { registerJiraCapabilities } from "./jira";
import { registerGoogleDriveCapabilities } from "./google-drive";

/**
 * Provider bootstrap. Idempotently registers every provider's capability
 * handlers on the Universal Capability Runtime. Adding a provider = one handler
 * module (mirroring ./github) + one registration call here.
 */

let done = false;

export function ensureProvidersRegistered(): void {
  if (done) return;
  done = true;
  registerGitHubCapabilities();
  registerSlackCapabilities();
  registerNotionCapabilities();
  registerLinearCapabilities();
  registerDiscordCapabilities();
  registerJiraCapabilities();
  registerGoogleDriveCapabilities();
}
