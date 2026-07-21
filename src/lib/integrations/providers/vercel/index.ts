import "server-only";

import { getCanonicalVercelDeploymentStatus } from "@/lib/integrations/clients/vercel";
import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";

let registered = false;

/** Register the canonical read-only Vercel deployment capability. */
export function registerVercelCapabilities(): void {
  if (registered) return;
  registered = true;

  for (const capabilityId of [
    "deployment_status",
    "production_url_verification",
    "build_status",
    "list_deployments",
  ] as const) {
    registerCapabilityHandler<Record<string, unknown>, unknown>(
      "vercel",
      capabilityId,
      async ({ userId, input }) =>
        getCanonicalVercelDeploymentStatus(userId, input),
    );
  }
}
