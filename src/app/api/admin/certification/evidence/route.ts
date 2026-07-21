import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getRuntimeDeploymentIdentity } from "@/lib/deployment/identity";
import { createCertificationResult } from "@/lib/evidence/certification";
import { EVIDENCE_TYPES } from "@/lib/evidence/model";
import {
  AIOS_WORKFORCE,
  AIOS_WORKFORCE_REGISTRY_VERSION,
} from "@/lib/workforce/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Founder-only, read-only Evidence Layer certification.
 *
 * The response is deliberately allowlisted. It contains deployment metadata,
 * registry metadata, and the canonical evidence vocabulary only—never user
 * identity, tokens, credentials, cookies, headers, prompts, memory, or customer
 * data.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const deployment = getRuntimeDeploymentIdentity(now);
  const certification = createCertificationResult({
    outcome: true,
    evidenceType: "authenticated_runtime_proof",
    observedBy: "api.admin.certification.evidence",
    confidence: 1,
    observedAt: now,
    details: {
      scope: "evidence_layer" as const,
      schemaVersion: "1.0.0",
      supportedEvidenceTypes: EVIDENCE_TYPES,
      deployment,
      workforceRegistry: {
        version: AIOS_WORKFORCE_REGISTRY_VERSION,
        agentCount: AIOS_WORKFORCE.length,
        agentKeys: AIOS_WORKFORCE.map((agent) => agent.key),
      },
    },
  });

  return NextResponse.json({ ok: true, certification });
}
