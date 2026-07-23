import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CERTIFICATION_NAME = "operational-runtime-live";
export const REQUIRED_COMPONENTS = [
  "harmony_orchestration",
  "julius_retrieval",
  "connector_runtime",
  "approval_runtime",
  "supabase_runtime",
  "event_mesh_runtime",
];

const APPROVED_REPOSITORY = "AIOS-HQ/aios-platform";
const PRODUCTION_HOSTS = new Set([
  "aios-platform-omega.vercel.app",
  "aios-platform.vercel.app",
]);
const SENSITIVE_KEYS = new Set([
  "email",
  "userid",
  "password",
  "cookie",
  "cookies",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "headers",
  "apikey",
  "service_role",
  "servicerole",
  "supabasekey",
  "connectionstring",
  "prompt",
  "memory",
  "profile",
]);

export class CertificationFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "CertificationFailure";
    this.code = code;
  }
}

function fail(code) {
  throw new CertificationFailure(code);
}

function normalizedKey(key) {
  return String(key).replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

function assertNoSensitiveKeys(value, path = "root") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    if (SENSITIVE_KEYS.has(normalized)) fail("unexpected_sensitive_field");
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

export function validateExpectedHeadSha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    fail("invalid_expected_head_sha");
  }
  return value;
}

export function validatePreviewUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("invalid_preview_url");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
  ) {
    fail("invalid_preview_url");
  }
  if (PRODUCTION_HOSTS.has(hostname)) fail("production_url_rejected");
  if (!/^aios-platform-[a-z0-9-]+-air-bid\.vercel\.app$/.test(hostname)) {
    fail("unapproved_preview_host");
  }
  return new URL(`https://${hostname}/`).toString();
}

export function validateDeploymentIdentity(deployment, expectedHeadSha) {
  const expected = validateExpectedHeadSha(expectedHeadSha);
  if (!deployment || typeof deployment !== "object") fail("missing_deployment_identity");
  if (deployment.commitSha !== expected) fail("stale_deployment_sha");
  if (deployment.environment !== "preview") fail("wrong_deployment_environment");
  if (typeof deployment.vercelDeploymentId !== "string" || !deployment.vercelDeploymentId.startsWith("dpl_")) {
    fail("invalid_deployment_id");
  }
  return deployment;
}

export function validatePreviewCredentials(email, password) {
  if (typeof email !== "string" || email.trim().length === 0) fail("missing_preview_credentials");
  if (typeof password !== "string" || password.length === 0) fail("missing_preview_credentials");
  return { email, password };
}

export function validateSessionDiagnostic(payload) {
  const diagnostic = payload?.diagnostic;
  if (payload?.ok !== true || payload?.environment !== "preview" || !diagnostic) {
    fail("session_diagnostic_failed");
  }
  if (diagnostic.supabaseConfigured !== true) fail("supabase_not_configured");
  if (diagnostic.supabaseCookiePresent !== true) fail("session_cookie_missing");
  if (diagnostic.authenticatedUserResolved !== true) fail("authenticated_user_not_resolved");
  if (diagnostic.founderAuthorizationResolved !== true) fail("founder_authorization_failed");
  if (diagnostic.requestOriginMatchesConfiguredSiteOrigin !== true) fail("preview_origin_mismatch");
  if (diagnostic.likelyFailureStage !== "authenticated") fail("session_diagnostic_not_authenticated");
  assertNoSensitiveKeys(payload);
  return diagnostic;
}

function requireCount(summary, key) {
  if (!Number.isInteger(summary?.[key]) || summary[key] < 0) fail("invalid_operational_summary");
  return summary[key];
}

export function validateCompactEvidence(payload, expectedHeadSha) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("invalid_compact_evidence");
  }
  const keys = Object.keys(payload).sort();
  const allowed = [
    "deployment",
    "ok",
    "operationalRuntimeFoundation",
    "operationalRuntimeSummary",
  ].sort();
  if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
    fail("unexpected_compact_evidence_section");
  }
  if (payload.ok !== true) fail("compact_evidence_failed");
  validateDeploymentIdentity(payload.deployment, expectedHeadSha);

  const summary = payload.operationalRuntimeSummary;
  const componentCount = requireCount(summary, "componentCount");
  const healthy = requireCount(summary, "healthy");
  const degraded = requireCount(summary, "degraded");
  const blocked = requireCount(summary, "blocked");
  const unavailable = requireCount(summary, "unavailable");
  const unknown = requireCount(summary, "unknown");
  if (
    componentCount !== REQUIRED_COMPONENTS.length
    || healthy + degraded + blocked + unavailable + unknown !== componentCount
    || blocked !== 0
    || unavailable !== 0
    || unknown !== 0
  ) {
    fail("operational_runtime_not_certifiable");
  }
  if (!/^[0-9a-f]{64}$/.test(summary.runtimeCondition?.conditionId ?? "")) {
    fail("invalid_runtime_condition_id");
  }
  if (!/^[0-9a-f]{64}$/.test(summary.outcomeId ?? "")) fail("invalid_runtime_outcome_id");

  const foundation = payload.operationalRuntimeFoundation;
  if (!Array.isArray(foundation) || foundation.length !== REQUIRED_COMPONENTS.length) {
    fail("missing_operational_runtime_foundation");
  }
  const found = new Set();
  for (const item of foundation) {
    if (!REQUIRED_COMPONENTS.includes(item?.component) || found.has(item.component)) {
      fail("invalid_operational_component");
    }
    found.add(item.component);
    if (["unknown", "unavailable", "blocked"].includes(item.status)) {
      fail("operational_component_not_live_verified");
    }
    if (!["live_runtime_proof", "authenticated_runtime_proof"].includes(item.evidenceType)) {
      fail("operational_component_missing_live_evidence");
    }
    if (item.details?.liveProbeAttempted !== true) fail("operational_probe_not_attempted");
    if (typeof item.runtimeConditionId !== "string" || item.runtimeConditionId !== summary.runtimeCondition.conditionId) {
      fail("operational_condition_mismatch");
    }
    if (typeof item.latencyBucket !== "string") fail("operational_latency_missing");
  }
  assertNoSensitiveKeys(payload);
  return payload;
}

export function buildSafeArtifact({
  prNumber,
  expectedHeadSha,
  compactEvidence,
  verifiedAt = new Date().toISOString(),
}) {
  if (!Number.isInteger(prNumber) || prNumber < 1) fail("invalid_pr_number");
  validateCompactEvidence(compactEvidence, expectedHeadSha);
  const artifact = {
    certification: CERTIFICATION_NAME,
    pr: prNumber,
    headSha: expectedHeadSha,
    previewUrlClassification: "approved_vercel_preview",
    authenticatedSession: true,
    founderAuthorized: true,
    originMatched: true,
    deployment: compactEvidence.deployment,
    operationalRuntimeSummary: compactEvidence.operationalRuntimeSummary,
    operationalRuntimeFoundation: compactEvidence.operationalRuntimeFoundation,
    verifiedAt,
    result: "passed",
  };
  assertArtifactSafe(artifact);
  return artifact;
}

export function assertArtifactSafe(artifact, credentialValues = []) {
  assertNoSensitiveKeys(artifact);
  const serialized = JSON.stringify(artifact);
  for (const value of credentialValues) {
    if (typeof value === "string" && value.length > 0 && serialized.includes(value)) {
      fail("credential_value_in_artifact");
    }
  }
  if (serialized.includes("supabase.co") || serialized.includes("postgresql://")) {
    fail("infrastructure_value_in_artifact");
  }
  return true;
}

async function responseJson(response, unauthorizedCode) {
  const status = response.status();
  if (status === 401) fail(`${unauthorizedCode}_unauthorized`);
  if (status === 403) fail(`${unauthorizedCode}_forbidden`);
  if (status === 404) fail(`${unauthorizedCode}_not_found`);
  if (status >= 500) fail(`${unauthorizedCode}_server_error`);
  if (!response.ok()) fail(`${unauthorizedCode}_request_failed`);
  try {
    return await response.json();
  } catch {
    fail(`${unauthorizedCode}_malformed_response`);
  }
}

export async function certifyWithBrowser({
  browser,
  previewUrl,
  expectedHeadSha,
  prNumber,
  email,
  password,
  verifiedAt,
}) {
  const approvedUrl = validatePreviewUrl(previewUrl);
  const credentials = validatePreviewCredentials(email, password);
  const approvedHost = new URL(approvedUrl).hostname;
  const context = await browser.newContext({
    ignoreHTTPSErrors: false,
    locale: "en-US",
    recordVideo: undefined,
  });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/login?redirect=%2Fharmony", approvedUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (new URL(page.url()).hostname !== approvedHost) fail("preview_protection_blocked");

    await page.locator('input[name="email"]').fill(credentials.email);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL((url) => url.hostname === approvedHost && !url.pathname.startsWith("/login"), {
        timeout: 30_000,
      });
    } catch {
      fail("preview_password_login_failed");
    }
    if (new URL(page.url()).hostname !== approvedHost) fail("preview_host_changed_after_login");

    const diagnosticResponse = await context.request.get(
      new URL("/api/admin/certification/session-diagnostic", approvedUrl).toString(),
      { headers: { Accept: "application/json" }, timeout: 30_000 },
    );
    const diagnostic = await responseJson(diagnosticResponse, "session_diagnostic");
    validateSessionDiagnostic(diagnostic);

    const compactResponse = await context.request.get(
      new URL("/api/admin/certification/evidence?probe=operational&format=compact", approvedUrl).toString(),
      { headers: { Accept: "application/json" }, timeout: 60_000 },
    );
    const compactEvidence = await responseJson(compactResponse, "compact_evidence");
    validateCompactEvidence(compactEvidence, expectedHeadSha);
    return buildSafeArtifact({ prNumber, expectedHeadSha, compactEvidence, verifiedAt });
  } finally {
    await context.close();
  }
}

async function githubJson(path, token, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) fail("github_deployment_lookup_failed");
  return response.json();
}

export async function discoverPreviewDeployment({
  repository = APPROVED_REPOSITORY,
  prNumber,
  expectedHeadSha,
  token,
  fetchImpl = fetch,
}) {
  if (repository !== APPROVED_REPOSITORY) fail("unapproved_repository");
  if (!Number.isInteger(prNumber) || prNumber < 1) fail("invalid_pr_number");
  const expected = validateExpectedHeadSha(expectedHeadSha);
  if (typeof token !== "string" || token.length === 0) fail("missing_github_token");
  const pull = await githubJson(`/repos/${repository}/pulls/${prNumber}`, token, fetchImpl);
  if (pull.state !== "open") fail("pr_not_open");
  if (pull.head?.sha !== expected) fail("stale_pr_head_sha");
  if (pull.head?.repo?.full_name !== repository) fail("untrusted_pr_head_repository");

  const deployments = await githubJson(
    `/repos/${repository}/deployments?sha=${expected}&per_page=100`,
    token,
    fetchImpl,
  );
  const candidates = Array.isArray(deployments)
    ? deployments.filter((item) => item.sha === expected && /preview/i.test(item.environment ?? ""))
    : [];
  candidates.sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  for (const deployment of candidates) {
    const statuses = await githubJson(`/repos/${repository}/deployments/${deployment.id}/statuses`, token, fetchImpl);
    const successful = Array.isArray(statuses)
      ? statuses.find((status) => status.state === "success" && status.environment_url)
      : null;
    if (!successful) continue;
    return {
      previewUrl: validatePreviewUrl(successful.environment_url),
      deploymentId: deployment.id,
      deploymentSha: deployment.sha,
    };
  }
  fail("matching_preview_deployment_not_ready");
}

async function discoverWithPolling(input) {
  const attempts = 40;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await discoverPreviewDeployment(input);
    } catch (error) {
      if (!(error instanceof CertificationFailure) || error.code !== "matching_preview_deployment_not_ready") throw error;
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  }
  fail("matching_preview_deployment_not_ready");
}

async function main() {
  const command = process.argv[2];
  if (command === "credentials-preflight") {
    validatePreviewCredentials(
      process.env.AIOS_PREVIEW_FOUNDER_EMAIL,
      process.env.AIOS_PREVIEW_FOUNDER_PASSWORD,
    );
    console.info("preview_identity_credentials_ready=true");
    return;
  }
  if (command === "discover") {
    const result = await discoverWithPolling({
      repository: process.env.GITHUB_REPOSITORY,
      prNumber: Number(process.env.PR_NUMBER),
      expectedHeadSha: process.env.EXPECTED_HEAD_SHA,
      token: process.env.GITHUB_TOKEN,
    });
    if (!process.env.GITHUB_OUTPUT) fail("github_output_unavailable");
    await appendFile(process.env.GITHUB_OUTPUT, `preview_url=${result.previewUrl}\n`, { encoding: "utf8" });
    console.info("approved_preview_deployment_ready=true");
    return;
  }
  if (command === "certify") {
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch({ headless: true });
    try {
      const artifact = await certifyWithBrowser({
        browser,
        previewUrl: process.env.PREVIEW_URL,
        expectedHeadSha: process.env.EXPECTED_HEAD_SHA,
        prNumber: Number(process.env.PR_NUMBER),
        email: process.env.AIOS_PREVIEW_FOUNDER_EMAIL,
        password: process.env.AIOS_PREVIEW_FOUNDER_PASSWORD,
      });
      assertArtifactSafe(artifact, [
        process.env.AIOS_PREVIEW_FOUNDER_EMAIL,
        process.env.AIOS_PREVIEW_FOUNDER_PASSWORD,
      ]);
      const artifactPath = process.env.CERTIFICATION_ARTIFACT_PATH
        ?? "artifacts/operational-runtime-live-certification.json";
      const resolvedArtifactPath = resolve(artifactPath);
      await mkdir(dirname(resolvedArtifactPath), { recursive: true });
      await writeFile(resolvedArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      console.info("operational_preview_certification_passed=true");
    } finally {
      await browser.close();
    }
    return;
  }
  fail("unsupported_command");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof CertificationFailure ? error.code : "preview_certification_failed";
    console.error(code);
    process.exitCode = 1;
  });
}
