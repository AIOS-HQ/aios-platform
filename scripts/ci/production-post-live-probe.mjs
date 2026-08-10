import { pathToFileURL } from "node:url";

export const REQUIRED_COMPONENTS = [
  "harmony_orchestration",
  "julius_retrieval",
  "connector_runtime",
  "approval_runtime",
  "supabase_runtime",
  "event_mesh_runtime",
];

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

const CANONICAL_LATENCY_BUCKETS = new Set(["under_1s", "1s_to_3s", "3s_to_10s", "over_10s"]);

export class ProductionPostLiveProbeFailure extends Error {
  constructor(code) {
    super(code);
    this.name = "ProductionPostLiveProbeFailure";
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPostLiveProbeFailure(code);
}

function normalizedKey(key) {
  return String(key).replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

function assertNoSensitive(value, path = "root") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitive(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(normalizedKey(k))) fail("unexpected_sensitive_field");
    if (typeof v === "string") {
      const low = v.toLowerCase();
      if (
        low.includes("password")
        || low.includes("bearer ")
        || low.includes("token")
        || low.includes("cookie")
        || low.includes("apikey")
        || low.includes("service_role")
      ) {
        fail("unexpected_sensitive_value");
      }
    }
    assertNoSensitive(v, `${path}.${k}`);
  }
}

export function validateTargetSha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) fail("invalid_target_sha");
  return value;
}

export function validateProductionFqdn(value) {
  if (typeof value !== "string") fail("invalid_production_fqdn");
  const fqdn = value.trim().toLowerCase();
  if (!fqdn || fqdn.includes("/") || fqdn.includes(":") || fqdn.includes("?")) fail("invalid_production_fqdn");
  if (!/^[a-z0-9.-]+$/.test(fqdn) || !fqdn.includes(".")) fail("invalid_production_fqdn");
  return fqdn;
}

export function buildProductionOriginFromFqdn(fqdn) {
  return new URL(`https://${validateProductionFqdn(fqdn)}/`).toString();
}

function requireCertifiableOperationalLive(payload, targetSha) {
  const live = payload?.certification?.details?.operationalRuntimeLive;
  if (!live || typeof live !== "object") fail("operational_runtime_live_missing");
  if (live.deploymentSha !== targetSha) fail("operational_runtime_live_sha_mismatch");
  if (live.deploymentEnvironment !== "production") fail("operational_runtime_live_environment_mismatch");
  if (live.certifiable !== true) fail("operational_runtime_live_not_certifiable");

  const summary = live.summary;
  if (!summary || typeof summary !== "object") fail("operational_runtime_live_summary_invalid");
  if (summary.componentCount !== 6 || summary.healthy !== 6) fail("operational_runtime_live_summary_not_fully_healthy");

  const foundation = live.foundation;
  if (!Array.isArray(foundation) || foundation.length !== 6) fail("operational_runtime_live_foundation_invalid");

  const seen = new Set();
  const conditionIds = new Set();

  for (const entry of foundation) {
    if (!entry || typeof entry !== "object") fail("operational_runtime_live_foundation_invalid");
    if (!REQUIRED_COMPONENTS.includes(entry.component)) fail("operational_runtime_live_component_unexpected");
    if (seen.has(entry.component)) fail("operational_runtime_live_component_duplicate");
    seen.add(entry.component);

    if (entry.status !== "healthy") fail("operational_runtime_live_component_not_healthy");
    if (!["live_runtime_proof", "authenticated_runtime_proof"].includes(entry.evidenceType)) {
      fail("operational_runtime_live_evidence_type_invalid");
    }
    if (entry?.details?.liveProbeAttempted !== true) fail("operational_runtime_live_probe_not_attempted");

    if (typeof entry.runtimeConditionId !== "string" || entry.runtimeConditionId.length === 0) {
      fail("operational_runtime_live_condition_missing");
    }
    conditionIds.add(entry.runtimeConditionId);

    if (typeof entry.latencyBucket !== "string" || !CANONICAL_LATENCY_BUCKETS.has(entry.latencyBucket)) {
      fail("operational_runtime_live_latency_invalid");
    }
  }

  if (seen.size !== REQUIRED_COMPONENTS.length) fail("operational_runtime_live_component_missing");
  if (conditionIds.size !== 1) fail("operational_runtime_live_condition_mismatch");

  return {
    operationalRuntimeSummary: summary,
    operationalRuntimeFoundation: foundation,
    runtimeConditionId: live?.runtimeCondition?.conditionId,
    outcomeId: live?.outcomeId,
  };
}

async function responseJson(response, label) {
  const status = typeof response.status === "function" ? response.status() : response.status;
  if (status === 401) fail(`${label}_unauthorized`);
  if (status === 403) fail(`${label}_forbidden`);
  if (!response.ok()) fail(`${label}_request_failed`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`${label}_invalid_json`);
  }
  return payload;
}

export async function probeProductionPostLive({
  browser,
  productionFqdn,
  targetSha,
  verifiedAt = new Date().toISOString(),
  email,
  password,
}) {
  const normalizedTargetSha = validateTargetSha(targetSha);
  const productionOrigin = buildProductionOriginFromFqdn(productionFqdn);

  if (!browser || typeof browser.newContext !== "function") fail("browser_unavailable");
  if (typeof email !== "string" || email.trim().length === 0) fail("missing_credentials");
  if (typeof password !== "string" || password.length === 0) fail("missing_credentials");

  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  try {
    const page = await context.newPage();
    const loginUrl = new URL("/login?redirect=%2Fharmony", productionOrigin).toString();

    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const expectedOrigin = new URL(productionOrigin).origin;
    if (new URL(page.url()).origin !== expectedOrigin) {
      fail("pre_login_origin_mismatch");
    }

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    try {
      await page.waitForURL(
        (url) => url.origin === expectedOrigin && url.pathname.startsWith("/harmony"),
        { timeout: 30_000 },
      );
    } catch {
      fail("production_password_login_failed");
    }

    const finalUrl = new URL(page.url());
    if (finalUrl.origin !== expectedOrigin || !finalUrl.pathname.startsWith("/harmony")) {
      fail("post_login_redirect_invalid");
    }

    const evidenceResponse = await context.request.get(
      new URL("/api/admin/certification/evidence?probe=operational", productionOrigin).toString(),
      { headers: { Accept: "application/json" }, timeout: 60_000 },
    );

    const evidencePayload = await responseJson(evidenceResponse, "operational_evidence");
    const {
      operationalRuntimeSummary,
      operationalRuntimeFoundation,
      runtimeConditionId,
      outcomeId,
    } = requireCertifiableOperationalLive(
      evidencePayload,
      normalizedTargetSha,
    );

    if (typeof runtimeConditionId !== "string" || !/^[0-9a-f]{64}$/.test(runtimeConditionId)) {
      fail("operational_runtime_condition_id_invalid");
    }
    if (typeof outcomeId !== "string" || !/^[0-9a-f]{64}$/.test(outcomeId)) {
      fail("operational_runtime_outcome_id_invalid");
    }
    for (const entry of operationalRuntimeFoundation) {
      if (entry.runtimeConditionId !== runtimeConditionId) {
        fail("operational_runtime_foundation_condition_mismatch");
      }
    }

    const result = {
      authenticatedSession: true,
      founderAuthorized: true,
      originMatched: true,
      operationalRuntimeSummary: {
        ...operationalRuntimeSummary,
        runtimeCondition: { conditionId: runtimeConditionId },
        outcomeId,
      },
      operationalRuntimeFoundation,
      verifiedAt,
    };

    assertNoSensitive(result);
    const serializedResult = JSON.stringify(result);
    if (serializedResult.includes(email)) fail("credential_email_leaked");
    if (serializedResult.includes(password)) fail("credential_password_leaked");
    return result;
  } finally {
    await context.close();
  }
}

async function main() {
  const command = process.argv[2];
  if (command !== "probe") {
    console.error("usage: node scripts/ci/production-post-live-probe.mjs probe <production-fqdn> <target-sha>");
    process.exit(1);
  }

  const productionFqdn = process.argv[3];
  const targetSha = process.argv[4];
  const email = process.env.AIOS_PRODUCTION_CERT_FOUNDER_EMAIL;
  const password = process.env.AIOS_PRODUCTION_CERT_FOUNDER_PASSWORD;

  if (!email || !password) fail("missing_credentials");

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const result = await probeProductionPostLive({
      browser,
      productionFqdn,
      targetSha,
      email,
      password,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error?.code ?? "production_post_live_probe_failed";
    console.error(code);
    process.exit(1);
  });
}
