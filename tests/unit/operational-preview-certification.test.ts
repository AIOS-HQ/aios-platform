import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CertificationFailure,
  assertArtifactSafe,
  buildSafeArtifact,
  certifyWithBrowser,
  discoverPreviewDeployment,
  validateCompactEvidence,
  validateExpectedHeadSha,
  validatePreviewCredentials,
  validatePreviewUrl,
  validateSessionDiagnostic,
} from "../../scripts/ci/operational-preview-certification.mjs";

const HEAD_SHA = "a".repeat(40);
const CONDITION_ID = "b".repeat(64);
const OUTCOME_ID = "c".repeat(64);
const PREVIEW_URL = "https://aios-platform-git-certification-air-bid.vercel.app/";

function compactEvidence(overrides: Record<string, unknown> = {}) {
  const foundation = [
    "harmony_orchestration",
    "julius_retrieval",
    "connector_runtime",
    "approval_runtime",
    "supabase_runtime",
    "event_mesh_runtime",
  ].map((component, index) => ({
    component,
    status: index === 0 ? "healthy" : "degraded",
    evidenceType: index === 0 ? "live_runtime_proof" : "authenticated_runtime_proof",
    observedAt: "2026-07-23T12:00:00.000Z",
    observedBy: `operational_runtime.probe.${component}`,
    confidence: index === 0 ? 0.95 : 0.85,
    details: { scope: "operational_runtime", liveProbeRequired: true, liveProbeAttempted: true },
    runtimeConditionId: CONDITION_ID,
    latencyBucket: "under_1s",
    safeErrorCode: null,
    safeMessage: `${component}_probe_succeeded`,
  }));
  return {
    ok: true,
    deployment: {
      commitSha: HEAD_SHA,
      environment: "preview",
      buildTimestamp: null,
      requestTimestamp: "2026-07-23T12:00:00.000Z",
      vercelDeploymentId: "dpl_safe_preview",
    },
    operationalRuntimeSummary: {
      componentCount: 6,
      healthy: 1,
      degraded: 5,
      blocked: 0,
      unavailable: 0,
      unknown: 0,
      runtimeCondition: { conditionId: CONDITION_ID, logicVersion: "operational-live-probe-v1" },
      outcomeId: OUTCOME_ID,
    },
    operationalRuntimeFoundation: foundation,
    ...overrides,
  };
}

function diagnostic(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    environment: "preview",
    diagnostic: {
      supabaseConfigured: true,
      supabaseCookiePresent: true,
      authenticatedUserResolved: true,
      founderAuthorizationResolved: true,
      requestOriginMatchesConfiguredSiteOrigin: true,
      likelyFailureStage: "authenticated",
      operatorHint: "open_compact_operational_certification",
      ...overrides,
    },
  };
}

function apiResponse(status: number, payload: unknown) {
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    json: async () => payload,
  };
}

function fakeBrowser(options: {
  loginFails?: boolean;
  protectionRedirect?: boolean;
  diagnosticStatus?: number;
  diagnosticPayload?: unknown;
  compactStatus?: number;
  compactPayload?: unknown;
} = {}) {
  const filledSelectors: string[] = [];
  let currentUrl = `${PREVIEW_URL}login`;
  const page = {
    goto: async () => {
      currentUrl = options.protectionRedirect
        ? "https://vercel.com/sso-api"
        : `${PREVIEW_URL}login?redirect=%2Fharmony`;
    },
    url: () => currentUrl,
    locator: (selector: string) => ({
      fill: async () => {
        filledSelectors.push(selector);
      },
      click: async () => {
        if (!options.loginFails) currentUrl = `${PREVIEW_URL}harmony`;
      },
    }),
    waitForURL: async (predicate: (url: URL) => boolean) => {
      if (options.loginFails || !predicate(new URL(currentUrl))) throw new Error("safe_login_failure");
    },
  };
  const context = {
    newPage: async () => page,
    request: {
      get: async (url: string) => url.includes("session-diagnostic")
        ? apiResponse(options.diagnosticStatus ?? 200, options.diagnosticPayload ?? diagnostic())
        : apiResponse(options.compactStatus ?? 200, options.compactPayload ?? compactEvidence()),
    },
    close: async () => undefined,
  };
  return {
    filledSelectors,
    value: { newContext: async () => context },
  };
}

function expectFailure(code: string, work: () => unknown | Promise<unknown>) {
  return expect(work()).rejects.toMatchObject<Partial<CertificationFailure>>({ code });
}

describe("operational Preview live certification", () => {
  it("accepts only approved HTTPS AIOS Preview URLs", () => {
    expect(validatePreviewUrl(PREVIEW_URL)).toBe(PREVIEW_URL);
    expect(() => validatePreviewUrl("https://aios-platform-omega.vercel.app/")).toThrowError("production_url_rejected");
    expect(() => validatePreviewUrl("https://example.com/")).toThrowError("unapproved_preview_host");
    expect(() => validatePreviewUrl("http://aios-platform-git-test-air-bid.vercel.app/")).toThrowError("invalid_preview_url");
  });

  it("rejects invalid or stale head SHAs", () => {
    expect(validateExpectedHeadSha(HEAD_SHA)).toBe(HEAD_SHA);
    expect(() => validateExpectedHeadSha("short")).toThrowError("invalid_expected_head_sha");
    expect(() => validateCompactEvidence(compactEvidence(), "d".repeat(40))).toThrowError("stale_deployment_sha");
  });

  it("discovers only a successful deployment for the exact trusted PR head", async () => {
    const fetchImpl = async (url: string) => {
      const payload = url.includes("/pulls/")
        ? { state: "open", head: { sha: HEAD_SHA, repo: { full_name: "AIOS-HQ/aios-platform" } } }
        : url.includes("/statuses")
          ? [{ state: "success", environment_url: PREVIEW_URL }]
          : [{
              id: 10,
              sha: HEAD_SHA,
              environment: "Preview",
              created_at: "2026-07-23T12:00:00Z",
              performed_via_github_app: { slug: "vercel" },
            }];
      return { ok: true, json: async () => payload } as Response;
    };
    await expect(discoverPreviewDeployment({
      prNumber: 448,
      expectedHeadSha: HEAD_SHA,
      token: "test-github-token",
      fetchImpl,
    })).resolves.toEqual({ previewUrl: PREVIEW_URL, deploymentId: 10, deploymentSha: HEAD_SHA });
  });

  it("rejects deployment metadata without Vercel GitHub App provenance", async () => {
    const fetchImpl = async (url: string) => {
      const payload = url.includes("/pulls/")
        ? { state: "open", head: { sha: HEAD_SHA, repo: { full_name: "AIOS-HQ/aios-platform" } } }
        : [{ id: 10, sha: HEAD_SHA, environment: "Preview", created_at: "2026-07-23T12:00:00Z" }];
      return { ok: true, json: async () => payload } as Response;
    };
    await expect(discoverPreviewDeployment({
      prNumber: 448,
      expectedHeadSha: HEAD_SHA,
      token: "test-github-token",
      fetchImpl,
    })).rejects.toThrowError("matching_preview_deployment_not_ready");
  });

  it("fails closed when dedicated credentials are missing", () => {
    expect(() => validatePreviewCredentials("", "password")).toThrowError("missing_preview_credentials");
    expect(() => validatePreviewCredentials("preview@example.invalid", "")).toThrowError("missing_preview_credentials");
  });

  it("performs the complete successful login and certification flow through browser boundaries", async () => {
    const browser = fakeBrowser();
    const artifact = await certifyWithBrowser({
      browser: browser.value,
      previewUrl: PREVIEW_URL,
      expectedHeadSha: HEAD_SHA,
      prNumber: 448,
      email: "preview@example.invalid",
      password: "test-only-password",
      verifiedAt: "2026-07-23T12:00:00.000Z",
    });
    expect(browser.filledSelectors).toEqual(['input[name="email"]', 'input[name="password"]']);
    expect(artifact).toMatchObject({
      certification: "operational-runtime-live",
      pr: 448,
      headSha: HEAD_SHA,
      authenticatedSession: true,
      founderAuthorized: true,
      originMatched: true,
      result: "passed",
    });
  });

  it("fails safely when Preview protection or password login blocks the browser", async () => {
    const protectedBrowser = fakeBrowser({ protectionRedirect: true });
    await expectFailure("preview_protection_blocked", () => certifyWithBrowser({
      browser: protectedBrowser.value,
      previewUrl: PREVIEW_URL,
      expectedHeadSha: HEAD_SHA,
      prNumber: 448,
      email: "preview@example.invalid",
      password: "test-only-password",
    }));
    const failedLogin = fakeBrowser({ loginFails: true });
    await expectFailure("preview_password_login_failed", () => certifyWithBrowser({
      browser: failedLogin.value,
      previewUrl: PREVIEW_URL,
      expectedHeadSha: HEAD_SHA,
      prNumber: 448,
      email: "preview@example.invalid",
      password: "test-only-password",
    }));
  });

  it.each([
    ["session_cookie_missing", { supabaseCookiePresent: false }],
    ["authenticated_user_not_resolved", { authenticatedUserResolved: false }],
    ["founder_authorization_failed", { founderAuthorizationResolved: false }],
    ["preview_origin_mismatch", { requestOriginMatchesConfiguredSiteOrigin: false }],
  ])("rejects session diagnostic failure %s", (code, override) => {
    expect(() => validateSessionDiagnostic(diagnostic(override))).toThrowError(code);
  });

  it("rejects compact endpoint authorization failures", async () => {
    for (const [status, code] of [[401, "compact_evidence_unauthorized"], [403, "compact_evidence_forbidden"]] as const) {
      const browser = fakeBrowser({ compactStatus: status, compactPayload: { ok: false } });
      await expectFailure(code, () => certifyWithBrowser({
        browser: browser.value,
        previewUrl: PREVIEW_URL,
        expectedHeadSha: HEAD_SHA,
        prNumber: 448,
        email: "preview@example.invalid",
        password: "test-only-password",
      }));
    }
  });

  it("rejects missing sections, unavailable runtimes, and sensitive fields", () => {
    const missing = compactEvidence();
    delete (missing as Record<string, unknown>).operationalRuntimeSummary;
    expect(() => validateCompactEvidence(missing, HEAD_SHA)).toThrowError("unexpected_compact_evidence_section");

    const unavailable = compactEvidence();
    unavailable.operationalRuntimeSummary.unavailable = 1;
    unavailable.operationalRuntimeSummary.degraded = 4;
    expect(() => validateCompactEvidence(unavailable, HEAD_SHA)).toThrowError("operational_runtime_not_certifiable");

    const sensitive = compactEvidence({ email: "must-not-appear@example.invalid" });
    expect(() => validateCompactEvidence(sensitive, HEAD_SHA)).toThrowError("unexpected_compact_evidence_section");
  });

  it("builds a redacted artifact with no credential or storage-state fields", () => {
    const artifact = buildSafeArtifact({
      prNumber: 448,
      expectedHeadSha: HEAD_SHA,
      compactEvidence: compactEvidence(),
      verifiedAt: "2026-07-23T12:00:00.000Z",
    });
    expect(assertArtifactSafe(artifact, ["preview@example.invalid", "test-only-password"])).toBe(true);
    const serialized = JSON.stringify(artifact).toLowerCase();
    for (const forbidden of ["email", "userid", "password", "cookie", "token", "authorization", "supabase.co"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps the workflow trusted-main, staging-protected, and free of bypass mechanisms", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/operational-preview-live-certification.yml"),
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("ref: refs/heads/main");
    expect(workflow).not.toContain("ref: ${{ inputs.expected_head_sha }}");
    expect(workflow).not.toContain("ref: ${{ github.event.pull_request.head.sha }}");
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("AIOS_PREVIEW_FOUNDER_EMAIL");
    expect(workflow).toContain("AIOS_PREVIEW_FOUNDER_PASSWORD");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("protection-bypass");
    expect(workflow).not.toContain("x-vercel-protection-bypass");
    expect(workflow).not.toMatch(/\bmerge\b/i);
  });
});
