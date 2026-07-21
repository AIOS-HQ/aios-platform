import "server-only";

import { getRuntimeDeploymentIdentity } from "@/lib/deployment/identity";
import { readGitHubVercelDeploymentEvidence } from "@/lib/integrations/clients/github";
import {
  normalizeGitHubVercelEvidence,
  normalizeRuntimeDeploymentIdentity,
  readDirectVercelDeploymentStatus,
  selectVercelEvidence,
  type VercelDeploymentEnvironment,
  type VercelDeploymentStatusResult,
} from "@/lib/integrations/vercel/deployment-status";

export interface VercelRunResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function stringParam(params: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function repositoryProject(params: Record<string, unknown>): string | null {
  const project = stringParam(params, "project", "projectId");
  if (project) return project;
  const repo = stringParam(params, "repo", "repository");
  return repo ? repo.split("/").at(-1) ?? null : null;
}

function deploymentEnvironment(params: Record<string, unknown>): VercelDeploymentEnvironment {
  const requested = stringParam(params, "environment", "target")?.toLowerCase();
  return requested === "production" ? "production" : "preview";
}

function canonicalDomain(params: Record<string, unknown>): string | null {
  return (
    stringParam(params, "canonicalDomain", "productionUrl") ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    null
  );
}

export async function getCanonicalVercelDeploymentStatus(
  userId: string,
  params: Record<string, unknown> = {},
): Promise<VercelDeploymentStatusResult> {
  const environment = deploymentEnvironment(params);
  const requestedGitSha = stringParam(params, "requestedGitSha", "expectedHeadSha", "gitSha", "headSha");
  const repository = stringParam(params, "repo", "repository");
  const expectedProject = repositoryProject(params);
  const productionDomain = canonicalDomain(params);

  const direct = await readDirectVercelDeploymentStatus({
    environment,
    requestedGitSha,
    branch: stringParam(params, "branch"),
    deploymentId: stringParam(params, "deploymentId"),
    deploymentUrl: stringParam(params, "deploymentUrl", "previewUrl"),
    expectedProject,
    expectedTeam: stringParam(params, "teamId"),
    canonicalDomain: productionDomain,
  });

  let githubEvidence = null;
  if (repository && requestedGitSha) {
    try {
      githubEvidence = await readGitHubVercelDeploymentEvidence(userId, {
        repository,
        gitSha: requestedGitSha,
        environment,
      });
    } catch {
      githubEvidence = null;
    }
  }
  const github = normalizeGitHubVercelEvidence({
    evidence: githubEvidence,
    environment,
    requestedGitSha,
    canonicalDomain: productionDomain,
  });
  const runtime = normalizeRuntimeDeploymentIdentity({
    identity: getRuntimeDeploymentIdentity(),
    environment,
    requestedGitSha,
    canonicalDomain: productionDomain,
  });

  return selectVercelEvidence([direct, github, runtime]);
}

/**
 * Canonical connector adapter. A known read capability always returns the
 * normalized status object, including unavailable/misconfigured states, so
 * ordinary Mason conversation and PR creation can continue while guarded
 * merge/deployment gates independently enforce readiness.
 */
export async function runVercelRead(
  userId: string,
  capabilityId: string,
  params: Record<string, unknown>,
): Promise<VercelRunResult> {
  if (
    capabilityId === "deployment_status" ||
    capabilityId === "build_status" ||
    capabilityId === "list_deployments" ||
    capabilityId === "production_url_verification"
  ) {
    const deploymentStatus = await getCanonicalVercelDeploymentStatus(userId, params);
    return {
      ok: true,
      data: deploymentStatus as unknown as Record<string, unknown>,
    };
  }

  if (capabilityId === "env_var_presence") {
    return {
      ok: false,
      error: "vercel_environment_values_are_not_exposed",
    };
  }

  return { ok: false, error: "unsupported_vercel_read" };
}
