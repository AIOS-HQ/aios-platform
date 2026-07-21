import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateVercelReadiness,
  getVercelConfigurationPresence,
  normalizeGitHubVercelEvidence,
  normalizeRuntimeDeploymentIdentity,
  readDirectVercelDeploymentStatus,
  redactVercelError,
  selectVercelEvidence,
  type VercelDirectConfig,
  type VercelDeploymentStatusResult,
} from "@/lib/integrations/vercel/deployment-status";

const config: VercelDirectConfig = {
  token: "test-token-never-logged",
  teamId: "team_aios",
  projectId: "prj_aios",
  canonicalDomain: "https://aios-platform-omega.vercel.app",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    uid: "dep_1",
    id: "dep_1",
    name: "aios-platform",
    url: "aios-platform-preview.vercel.app",
    alias: ["aios-platform-omega.vercel.app"],
    state: "READY",
    readyState: "READY",
    target: "production",
    createdAt: 1_782_000_000_000,
    readyAt: 1_782_000_030_000,
    meta: { githubCommitSha: "sha-1", githubCommitRef: "main" },
    ...overrides,
  };
}

function directFetch(
  deploymentPayload = deployment(),
  projectOverrides: Record<string, unknown> = {},
  events: unknown = { events: [{ type: "stdout" }] },
) {
  return vi.fn(async (input: string | URL | Request) => {
    const requestUrl = String(input);
    if (requestUrl.includes("/v9/projects/")) {
      return response({
        id: "prj_aios",
        name: "aios-platform",
        accountId: "team_aios",
        targets: { production: { id: "dep_1", alias: ["aios-platform-omega.vercel.app"] } },
        ...projectOverrides,
      });
    }
    if (requestUrl.includes("/v6/deployments")) {
      return response({ deployments: [deploymentPayload], pagination: { next: null } });
    }
    if (requestUrl.includes("/events")) return response(events);
    throw new Error(`unexpected_request:${requestUrl}`);
  }) as unknown as typeof fetch;
}

async function direct(
  overrides: Partial<Parameters<typeof readDirectVercelDeploymentStatus>[0]> = {},
) {
  return readDirectVercelDeploymentStatus({
    environment: "production",
    requestedGitSha: "sha-1",
    expectedProject: "aios-platform",
    expectedTeam: "team_aios",
    canonicalDomain: "https://aios-platform-omega.vercel.app",
    config,
    fetchImpl: directFetch(),
    now: new Date("2026-07-21T06:00:00.000Z"),
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("canonical Vercel deployment status", () => {
  it("normalizes a healthy direct Vercel deployment", async () => {
    const result = await direct();
    expect(result).toMatchObject({
      status: "healthy",
      evidenceTier: "direct_vercel_api",
      environment: "production",
      gitSha: "sha-1",
      gitShaMatches: true,
      requiredChecksPassed: true,
      buildEventsAvailable: true,
      runtimeLogsAvailable: false,
    });
    expect(result.evidenceSources).toContain("vercel_alias");
  });

  it("normalizes a pending direct deployment", async () => {
    const result = await direct({
      fetchImpl: directFetch(deployment({ state: "BUILDING", readyState: "BUILDING" })),
    });
    expect(result.status).toBe("pending");
    expect(result.requiredChecksPassed).toBe(false);
  });

  it("normalizes a failed direct deployment", async () => {
    const result = await direct({
      fetchImpl: directFetch(deployment({ state: "ERROR", readyState: "ERROR" })),
    });
    expect(result.status).toBe("failed");
    expect(result.requiredChecksPassed).toBe(false);
  });

  it("returns unavailable when direct configuration is missing", async () => {
    const result = await readDirectVercelDeploymentStatus({
      environment: "preview",
      requestedGitSha: "sha-1",
      config: null,
    });
    expect(result.status).toBe("unavailable");
    expect(result.errorCode).toBe("vercel_configuration_missing");
  });

  it("reports configuration presence without returning values", () => {
    vi.stubEnv("VERCEL_TOKEN", "secret-value");
    vi.stubEnv("VERCEL_TEAM_ID", "team_aios");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_aios");
    const result = getVercelConfigurationPresence();
    expect(result).toEqual({
      tokenPresent: true,
      teamPresent: true,
      projectPresent: true,
      canonicalDomainPresent: false,
      complete: true,
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("returns misconfigured for unauthorized credentials", async () => {
    const fetchImpl = vi.fn(async () => response({ error: { message: "forbidden" } }, 403)) as unknown as typeof fetch;
    const result = await direct({ fetchImpl });
    expect(result.status).toBe("misconfigured");
    expect(result.errorCode).toBe("vercel_unauthorized");
    expect(JSON.stringify(result)).not.toContain(config.token);
  });

  it("detects project and team mismatches", async () => {
    const project = await direct({ expectedProject: "different-project" });
    expect(project.status).toBe("misconfigured");
    expect(project.errorCode).toBe("vercel_project_scope_mismatch");

    const team = await direct({ expectedTeam: "different-team" });
    expect(team.status).toBe("misconfigured");
    expect(team.errorCode).toBe("vercel_scope_mismatch");
  });

  it("detects Git SHA mismatch", async () => {
    const result = await direct({ requestedGitSha: "different-sha" });
    expect(result.status).toBe("misconfigured");
    expect(result.gitShaMatches).toBe(false);
    expect(result.errorCode).toBe("vercel_git_sha_mismatch");
  });

  it("does not confuse preview and production deployments", async () => {
    const result = await direct({
      fetchImpl: directFetch(deployment({ target: null, alias: [] })),
    });
    expect(result.status).toBe("misconfigured");
    expect(result.errorCode).toBe("vercel_environment_mismatch");
  });

  it("detects canonical alias mismatch", async () => {
    const result = await direct({
      fetchImpl: directFetch(
        deployment({ alias: ["wrong.vercel.app"] }),
        { targets: { production: { id: "dep_1", alias: ["wrong.vercel.app"] } } },
      ),
    });
    expect(result.status).toBe("misconfigured");
    expect(result.errorCode).toBe("vercel_alias_mismatch");
  });

  it("distinguishes build events from runtime logs", async () => {
    const result = await direct();
    expect(result.buildEventsAvailable).toBe(true);
    expect(result.runtimeLogsAvailable).toBe(false);
    expect(result.runtimeLogLimitations).toContain("do not prove runtime-log access");
  });

  it("handles API timeout and malformed responses safely", async () => {
    const timeoutFetch = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;
    const timeout = await direct({ fetchImpl: timeoutFetch });
    expect(timeout.status).toBe("unavailable");
    expect(timeout.errorCode).toBe("vercel_timeout");

    const malformedFetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("/v9/projects/")) {
        return response({ id: "prj_aios", name: "aios-platform", accountId: "team_aios" });
      }
      return response({ invalid: true });
    }) as unknown as typeof fetch;
    const malformed = await direct({ fetchImpl: malformedFetch });
    expect(malformed.status).toBe("unavailable");
    expect(malformed.errorCode).toBe("vercel_malformed_response");
  });

  it("redacts authorization and token material", () => {
    const redacted = redactVercelError(
      new Error("Authorization: Bearer abc.def token=super-secret"),
    );
    expect(redacted).not.toContain("abc.def");
    expect(redacted).not.toContain("super-secret");
    expect(redacted).toContain("[REDACTED]");
  });

  it("normalizes GitHub Vercel deployment fallback distinctly", () => {
    const result = normalizeGitHubVercelEvidence({
      environment: "preview",
      requestedGitSha: "sha-1",
      evidence: {
        status: "success",
        deploymentId: 42,
        deploymentUrl: "preview.vercel.app",
        environment: "Preview",
        gitSha: "sha-1",
        sources: ["github_vercel_status", "github_vercel_deployment"],
      },
    });
    expect(result.status).toBe("healthy");
    expect(result.evidenceTier).toBe("github_vercel_deployment_status");
    expect(result.gitShaMatches).toBe(true);
  });

  it("normalizes runtime identity fallback distinctly", () => {
    const result = normalizeRuntimeDeploymentIdentity({
      environment: "production",
      requestedGitSha: "sha-1",
      identity: {
        commitSha: "sha-1",
        environment: "production",
        buildTimestamp: "2026-07-21T05:00:00.000Z",
        requestTimestamp: "2026-07-21T06:00:00.000Z",
        vercelDeploymentId: "dep_1",
      },
    });
    expect(result.status).toBe("healthy");
    expect(result.evidenceTier).toBe("runtime_deployment_identity");
    expect(result.requiredChecksPassed).toBeNull();
  });

  it("keeps evidence tiers ordered and rejects contradictory SHAs", () => {
    const directResult = {
      ...(normalizeRuntimeDeploymentIdentity({
        environment: "production",
        identity: {
          commitSha: "sha-direct",
          environment: "production",
          buildTimestamp: null,
          requestTimestamp: "2026-07-21T06:00:00.000Z",
          vercelDeploymentId: "dep_1",
        },
      }) as VercelDeploymentStatusResult),
      evidenceTier: "direct_vercel_api" as const,
    };
    const runtime = normalizeRuntimeDeploymentIdentity({
      environment: "production",
      identity: {
        commitSha: "sha-runtime",
        environment: "production",
        buildTimestamp: null,
        requestTimestamp: "2026-07-21T06:00:00.000Z",
        vercelDeploymentId: "dep_2",
      },
    });
    const selected = selectVercelEvidence([directResult, runtime]);
    expect(selected.status).toBe("misconfigured");
    expect(selected.errorCode).toBe("vercel_evidence_conflict");
  });

  it("blocks readiness for pending, failed, unavailable, misconfigured, or mismatched evidence", async () => {
    for (const status of ["pending", "failed", "unavailable", "misconfigured"] as const) {
      const result = { ...(await direct()), status };
      expect(evaluateVercelReadiness(result, { requireChecks: true }).ready).toBe(false);
    }
    const mismatch = { ...(await direct()), gitShaMatches: false };
    expect(evaluateVercelReadiness(mismatch, { requireChecks: true }).ready).toBe(false);
  });

  it("allows readiness only with truthful green evidence", async () => {
    const result = await direct();
    expect(evaluateVercelReadiness(result, {
      requireChecks: true,
      requireProductionAlias: true,
    })).toEqual({ ready: true, code: "vercel_ready" });
  });

  it("returns unavailable as data instead of failing ordinary connector use", async () => {
    vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("VERCEL_API_TOKEN", "");
    vi.stubEnv("VERCEL_TEAM_ID", "");
    vi.stubEnv("VERCEL_PROJECT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const { runVercelRead } = await import("@/lib/integrations/clients/vercel");
    const result = await runVercelRead("founder-1", "deployment_status", {
      environment: "preview",
    });
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe("unavailable");
    expect(result.data?.evidenceTier).toBe("unavailable");
  });
});
