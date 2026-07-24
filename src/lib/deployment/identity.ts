import "server-only";

export interface RuntimeDeploymentIdentity {
  commitSha: string | null;
  environment: string;
  vercelProjectId: string | null;
  vercelProjectProductionUrl: string | null;
  vercelBranchUrl: string | null;
  vercelUrl: string | null;
  host: string | null;
  buildTimestamp: string | null;
  requestTimestamp: string;
  vercelDeploymentId: string | null;
}

/**
 * Safe, value-limited identity for the build currently serving the request.
 * This intentionally exposes no credentials or environment-variable values
 * beyond deployment metadata already safe for authenticated diagnostics.
 */
export function getRuntimeDeploymentIdentity(now = new Date()): RuntimeDeploymentIdentity {
  return {
    commitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_GIT_SHA ??
      null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    vercelProjectId: process.env.VERCEL_PROJECT_ID ?? null,
    vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    host: process.env.VERCEL_URL ?? process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
    buildTimestamp:
      process.env.BUILD_TIMESTAMP ??
      process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ??
      null,
    requestTimestamp: now.toISOString(),
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  };
}
