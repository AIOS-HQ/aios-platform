import "server-only";

import { getCanonicalVercelDeploymentStatus } from "@/lib/integrations/clients/vercel";
import { getVercelConfigurationPresence } from "@/lib/integrations/vercel/deployment-status";
import type {
  DiagnosticItem,
  DiagnosticsResult,
} from "@/lib/integrations/clients/supabase-diagnostics";

/**
 * Read-only Vercel diagnostics backed by the same canonical deployment-status
 * capability Mason and Harmony use. No separate status interpretation and no
 * credential values leave the server.
 */
export async function runVercelDiagnostics(userId: string): Promise<DiagnosticsResult> {
  const status = await getCanonicalVercelDeploymentStatus(userId, {
    repo: process.env.HARMONY_DEFAULT_GITHUB_REPO ?? process.env.GITHUB_DEFAULT_REPO ?? "AIOS-HQ/aios-platform",
    environment: "production",
    requestedGitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_GIT_SHA ??
      null,
  });
  const configuration = getVercelConfigurationPresence();

  const items: DiagnosticItem[] = [
    {
      id: "deployment_status",
      ok: status.status === "healthy",
      detail: `${status.status} via ${status.evidenceTier}`,
    },
    {
      id: "production_url_verification",
      ok:
        status.status === "healthy" &&
        (status.evidenceSources.includes("vercel_alias") ||
          (status.evidenceSources.includes("github_vercel_deployment") &&
            status.evidenceSources.includes("runtime_deployment_identity"))),
      detail: status.canonicalDomain ?? "canonical domain not proven",
    },
    {
      id: "build_status",
      ok: status.requiredChecksPassed === true,
      detail: status.readyState ?? status.deploymentState ?? "unavailable",
    },
    {
      id: "env_var_presence",
      ok: configuration.complete,
      detail: configuration.complete
        ? "direct read configuration present"
        : "direct read configuration incomplete; fallback evidence may still be available",
    },
  ];

  return {
    connected: status.evidenceTier !== "unavailable",
    items,
  };
}
