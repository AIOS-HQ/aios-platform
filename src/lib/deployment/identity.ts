import "server-only";

export interface RuntimeDeploymentIdentity {
  commitSha: string | null;
  environment: string;
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
    buildTimestamp:
      process.env.BUILD_TIMESTAMP ??
      process.env.NEXT_PUBLIC_BUILD_TIMESTAMP ??
      null,
    requestTimestamp: now.toISOString(),
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  };
}
