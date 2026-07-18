import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

function deploymentIdentity() {
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
    requestTimestamp: new Date().toISOString(),
    vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
  };
}

export async function GET() {
  await requireUser();
  return NextResponse.json({ ok: true, identity: deploymentIdentity() });
}
