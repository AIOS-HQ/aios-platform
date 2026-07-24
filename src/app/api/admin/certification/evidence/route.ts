import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getRuntimeDeploymentIdentity } from "@/lib/deployment/identity";
import { createCertificationResult } from "@/lib/evidence/certification";
import { buildStrictValidationEvidence, redactValidationEvidenceAllowlist } from "@/lib/evidence/validation-evidence";
import { EVIDENCE_TYPES } from "@/lib/evidence/model";
import { getOperationalRuntimeFoundation } from "@/lib/operational-runtime/certification";
import { getAgentRuntimeMappings } from "@/lib/runtime-identity/agent-mappings";
import { certifyAgentRuntimes } from "@/lib/runtime-identity/agent-certification";
import { probeRuntimeIdentity } from "@/lib/runtime-identity/probe";
import { resolveRuntimeIdentity } from "@/lib/runtime-identity/resolver";
import {
  AIOS_WORKFORCE,
  AIOS_WORKFORCE_REGISTRY_VERSION,
} from "@/lib/workforce/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Founder-only, read-only Evidence Layer certification.
 *
 * The response is deliberately allowlisted. It contains deployment metadata,
 * registry metadata, and the canonical evidence vocabulary only—never user
 * identity, tokens, credentials, cookies, headers, prompts, memory, or customer
 * data.
 */
export async function GET(request?: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const deployment = getRuntimeDeploymentIdentity(now);
  const probeMode = request
    ? new URL(request.url).searchParams.get("probe")
    : null;
  const inferenceProbeRequested = probeMode === "1" || probeMode === "workforce";
  const workforceProbeRequested = probeMode === "workforce";
  const runtimeIdentity = inferenceProbeRequested
    ? await probeRuntimeIdentity({ observedAt: now })
    : resolveRuntimeIdentity(process.env, now);
  const workforceRuntime = workforceProbeRequested
    ? await certifyAgentRuntimes({
        providerIdentity: runtimeIdentity,
        observedAt: now,
        deploymentEnvironment: deployment.environment,
        deploymentSha: deployment.commitSha,
      })
    : null;
  const agentRuntimeMappings = workforceRuntime?.mappings ?? getAgentRuntimeMappings(runtimeIdentity, now);
  const certification = createCertificationResult({
    outcome: true,
    evidenceType: "authenticated_runtime_proof",
    observedBy: "api.admin.certification.evidence",
    confidence: 1,
    observedAt: now,
    details: {
      scope: "evidence_layer" as const,
      schemaVersion: "1.4.0",
      validationEvidence: redactValidationEvidenceAllowlist(buildStrictValidationEvidence({
        deployment,
        expectedProjectId: process.env.AIOS_VALIDATION_VERCEL_PROJECT_ID ?? null,
        expectedHost: process.env.AIOS_VALIDATION_VERCEL_PREVIEW_HOST ?? null,
        expectedBranch: process.env.AIOS_VALIDATION_GIT_BRANCH ?? null,
        expectedSha: process.env.AIOS_VALIDATION_GIT_SHA ?? null,
      })),
      supportedEvidenceTypes: EVIDENCE_TYPES,
      deployment,
      runtimeIdentity,
      inferenceProbeRequested,
      workforceProbeRequested,
      workforceRuntimeSummary: workforceRuntime
        ? {
            agentCount: workforceRuntime.agentCount,
            healthy: workforceRuntime.healthy,
            degraded: workforceRuntime.degraded,
            blocked: workforceRuntime.blocked,
            unavailable: workforceRuntime.unavailable,
            proofStrategy: workforceRuntime.proofStrategy,
            agentSpecificProbeCount: workforceRuntime.agentSpecificProbeCount,
            providerProbeCount: workforceRuntime.providerProbeCount,
            runtimeCondition: workforceRuntime.runtimeCondition,
            outcomeId: workforceRuntime.outcomeId,
          }
        : null,
      agentRuntimeMappings,
      operationalRuntimeFoundation: getOperationalRuntimeFoundation(now),
      workforceRegistry: {
        version: AIOS_WORKFORCE_REGISTRY_VERSION,
        agentCount: AIOS_WORKFORCE.length,
        agentKeys: AIOS_WORKFORCE.map((agent) => agent.key),
      },
    },
  });

  return NextResponse.json({ ok: true, certification });
}
