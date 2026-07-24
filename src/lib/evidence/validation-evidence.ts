import "server-only";

import type { RuntimeDeploymentIdentity } from "@/lib/deployment/identity";

export const VALIDATION_EVIDENCE_SCHEMA_VERSION = "2.0.0" as const;

export type ValidationEvidenceStrictPayload = {
  schemaVersion: typeof VALIDATION_EVIDENCE_SCHEMA_VERSION;
  binding: {
    status: "bound" | "unbound";
    reason:
      | "ok"
      | "missing_expected_identity"
      | "missing_preview"
      | "project_mismatch"
      | "host_mismatch"
      | "branch_mismatch"
      | "sha_mismatch"
      | "environment_mismatch"
      | "provenance_mismatch";
    expected: {
      projectId: string | null;
      host: string | null;
      branch: string | null;
      sha: string | null;
      environment: "preview";
      provenance: "vercel_preview";
    };
    observed: {
      projectId: string | null;
      host: string | null;
      branch: string | null;
      sha: string | null;
      environment: string | null;
      provenance: "vercel_preview" | "unknown";
      deploymentId: string | null;
    };
  };
};

type BuildBindingInput = {
  deployment: RuntimeDeploymentIdentity;
  expectedProjectId?: string | null;
  expectedHost?: string | null;
  expectedBranch?: string | null;
  expectedSha?: string | null;
};

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeHost(value: string | null | undefined): string | null {
  const normalized = clean(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeBranch(value: string | null | undefined): string | null {
  const normalized = clean(value);
  if (!normalized) return null;
  return normalized.replace(/^refs\/heads\//, "");
}

function branchFromHost(host: string | null): string | null {
  if (!host) return null;
  const firstLabel = host.split(".")[0] ?? "";
  const normalized = firstLabel.trim();
  if (!normalized || normalized === "preview") return null;
  return normalized.replace(/---/g, "/");
}

function normalizeSha(value: string | null | undefined): string | null {
  const normalized = clean(value);
  return normalized ? normalized.toLowerCase() : null;
}

function observedHost(deployment: RuntimeDeploymentIdentity): string | null {
  return normalizeHost(deployment.host ?? deployment.vercelUrl ?? deployment.vercelBranchUrl ?? deployment.vercelProjectProductionUrl);
}

export function buildStrictValidationEvidence(
  input: BuildBindingInput,
): ValidationEvidenceStrictPayload {
  const expected = {
    projectId: clean(input.expectedProjectId),
    host: normalizeHost(input.expectedHost),
    branch: normalizeBranch(input.expectedBranch),
    sha: normalizeSha(input.expectedSha),
    environment: "preview" as const,
    provenance: "vercel_preview" as const,
  };

  const observed = {
    projectId: clean(input.deployment.vercelProjectId),
    host: observedHost(input.deployment),
    branch: normalizeBranch(input.deployment.vercelBranchUrl) ?? branchFromHost(observedHost(input.deployment)),
    sha: normalizeSha(input.deployment.commitSha),
    environment: clean(input.deployment.environment),
    provenance: input.deployment.vercelDeploymentId ? "vercel_preview" as const : "unknown" as const,
    deploymentId: clean(input.deployment.vercelDeploymentId),
  };

  let status: ValidationEvidenceStrictPayload["binding"]["status"] = "bound";
  let reason: ValidationEvidenceStrictPayload["binding"]["reason"] = "ok";
  const expectedIdentityComplete = Boolean(
    expected.projectId && expected.host && expected.branch && expected.sha,
  );

  if (!expectedIdentityComplete) {
    status = "unbound";
    reason = "missing_expected_identity";
  } else if (!observed.deploymentId || !observed.host || !observed.projectId) {
    status = "unbound";
    reason = "missing_preview";
  } else if (expected.projectId && expected.projectId !== observed.projectId) {
    status = "unbound";
    reason = "project_mismatch";
  } else if (expected.host && expected.host !== observed.host) {
    status = "unbound";
    reason = "host_mismatch";
  } else if (expected.branch && expected.branch !== observed.branch) {
    status = "unbound";
    reason = "branch_mismatch";
  } else if (expected.sha && expected.sha !== observed.sha) {
    status = "unbound";
    reason = "sha_mismatch";
  } else if (observed.environment !== "preview") {
    status = "unbound";
    reason = "environment_mismatch";
  } else if (observed.provenance !== "vercel_preview") {
    status = "unbound";
    reason = "provenance_mismatch";
  }

  return {
    schemaVersion: VALIDATION_EVIDENCE_SCHEMA_VERSION,
    binding: {
      status,
      reason,
      expected,
      observed,
    },
  };
}

export function redactValidationEvidenceAllowlist(
  payload: ValidationEvidenceStrictPayload,
): ValidationEvidenceStrictPayload {
  return {
    schemaVersion: payload.schemaVersion,
    binding: {
      status: payload.binding.status,
      reason: payload.binding.reason,
      expected: {
        projectId: payload.binding.expected.projectId,
        host: payload.binding.expected.host,
        branch: payload.binding.expected.branch,
        sha: payload.binding.expected.sha,
        environment: payload.binding.expected.environment,
        provenance: payload.binding.expected.provenance,
      },
      observed: {
        projectId: payload.binding.observed.projectId,
        host: payload.binding.observed.host,
        branch: payload.binding.observed.branch,
        sha: payload.binding.observed.sha,
        environment: payload.binding.observed.environment,
        provenance: payload.binding.observed.provenance,
        deploymentId: payload.binding.observed.deploymentId,
      },
    },
  };
}
