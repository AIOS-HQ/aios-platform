import { describe, expect, it } from "vitest";

import { buildStrictValidationEvidence, redactValidationEvidenceAllowlist, VALIDATION_EVIDENCE_SCHEMA_VERSION } from "@/lib/evidence/validation-evidence";

describe("strict validation evidence", () => {
  it("binds exactly to expected vercel preview identity", () => {
    const payload = buildStrictValidationEvidence({
      deployment: {
        commitSha: "abc123",
        environment: "preview",
        vercelProjectId: "prj_1",
        vercelProjectProductionUrl: "aios.example.com",
        vercelBranchUrl: "refs/heads/codex/mason-validation-intelligence",
        vercelUrl: "preview-aios.vercel.app",
        host: "preview-aios.vercel.app",
        buildTimestamp: "2026-07-24T00:00:00.000Z",
        requestTimestamp: "2026-07-24T00:00:00.000Z",
        vercelDeploymentId: "dpl_1",
      },
      expectedProjectId: "prj_1",
      expectedHost: "preview-aios.vercel.app",
      expectedBranch: "codex/mason-validation-intelligence",
      expectedSha: "abc123",
    });

    expect(payload.schemaVersion).toBe(VALIDATION_EVIDENCE_SCHEMA_VERSION);
    expect(payload.binding.status).toBe("bound");
    expect(payload.binding.reason).toBe("ok");
  });

  it("fails closed for environment mismatch", () => {
    const payload = buildStrictValidationEvidence({
      deployment: {
        commitSha: "abc123",
        environment: "production",
        vercelProjectId: "prj_1",
        vercelProjectProductionUrl: "aios.example.com",
        vercelBranchUrl: "refs/heads/codex/mason-validation-intelligence",
        vercelUrl: "preview-aios.vercel.app",
        host: "preview-aios.vercel.app",
        buildTimestamp: null,
        requestTimestamp: "2026-07-24T00:00:00.000Z",
        vercelDeploymentId: "dpl_1",
      },
      expectedProjectId: "prj_1",
      expectedHost: "preview-aios.vercel.app",
      expectedBranch: "codex/mason-validation-intelligence",
      expectedSha: "abc123",
    });

    expect(payload.binding.status).toBe("unbound");
    expect(payload.binding.reason).toBe("environment_mismatch");
  });

  it("retains only positive allowlist fields", () => {
    const payload = buildStrictValidationEvidence({
      deployment: {
        commitSha: "abc123",
        environment: "preview",
        vercelProjectId: "prj_1",
        vercelProjectProductionUrl: "aios.example.com",
        vercelBranchUrl: "refs/heads/codex/mason-validation-intelligence",
        vercelUrl: "preview-aios.vercel.app",
        host: "preview-aios.vercel.app",
        buildTimestamp: null,
        requestTimestamp: "2026-07-24T00:00:00.000Z",
        vercelDeploymentId: "dpl_1",
      },
    });
    const redacted = redactValidationEvidenceAllowlist(payload);
    expect(redacted).toEqual(payload);
    expect(Object.keys(redacted.binding.observed).sort()).toEqual([
      "branch",
      "deploymentId",
      "environment",
      "host",
      "projectId",
      "provenance",
      "sha",
    ]);
  });
});
