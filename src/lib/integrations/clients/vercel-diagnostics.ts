import "server-only";

import {
  createDiagnosticItem,
  createDiagnosticsResult,
  evidenceTypeFromVercelTier,
} from "@/lib/evidence/certification";
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
  const observedAt = new Date();
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
  const evidenceType = evidenceTypeFromVercelTier(status.evidenceTier);

  const items: DiagnosticItem[] = [
    createDiagnosticItem({
      id: "deployment_status",
      ok: status.status === "healthy",
      detail: `${status.status} via ${status.evidenceTier}`,
      evidenceType,
      observedBy: "diagnostics.vercel",
      confidence: evidenceType === "live_runtime_proof" ? 1 : evidenceType === "unknown" ? 0 : 0.85,
      observedAt,
      failureStatus: status.status === "unavailable" ? "unavailable" : "degraded",
      details: { scope: "vercel_deployment", check: "deployment_status" },
    }),
    createDiagnosticItem({
      id: "production_url_verification",
      ok:
        status.status === "healthy" &&
        (status.evidenceSources.includes("vercel_alias") ||
          (status.evidenceSources.includes("github_vercel_deployment") &&
            status.evidenceSources.includes("runtime_deployment_identity"))),
      detail: status.canonicalDomain ?? "canonical domain not proven",
      evidenceType,
      observedBy: "diagnostics.vercel",
      confidence: evidenceType === "live_runtime_proof" ? 1 : evidenceType === "unknown" ? 0 : 0.8,
      observedAt,
      details: { scope: "vercel_deployment", check: "production_url_verification" },
    }),
    createDiagnosticItem({
      id: "build_status",
      ok: status.requiredChecksPassed === true,
      detail: status.readyState ?? status.deploymentState ?? "unavailable",
      evidenceType,
      observedBy: "diagnostics.vercel",
      confidence: evidenceType === "live_runtime_proof" ? 1 : evidenceType === "unknown" ? 0 : 0.8,
      observedAt,
      details: { scope: "vercel_deployment", check: "build_status" },
    }),
    createDiagnosticItem({
      id: "env_var_presence",
      ok: configuration.complete,
      detail: configuration.complete
        ? "direct read configuration present"
        : "direct read configuration incomplete; fallback evidence may still be available",
      evidenceType: "configuration_proof",
      observedBy: "diagnostics.vercel",
      confidence: 1,
      observedAt,
      details: { scope: "vercel_deployment", check: "environment_presence" },
    }),
  ];

  return createDiagnosticsResult({
    connected: status.evidenceTier !== "unavailable",
    items,
    evidenceType,
    observedBy: "diagnostics.vercel",
    confidence: evidenceType === "live_runtime_proof" ? 1 : evidenceType === "unknown" ? 0 : 0.85,
    observedAt,
    details: { scope: "vercel_diagnostics", itemCount: items.length },
  });
}
