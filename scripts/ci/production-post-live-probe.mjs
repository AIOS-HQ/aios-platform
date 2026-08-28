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

const DEFAULT_LOGIN_HYDRATION_TIMEOUT_MS = 20_000;
const DEFAULT_LOGIN_REDIRECT_TIMEOUT_MS = 45_000;
const DEFAULT_LOGIN_POLL_INTERVAL_MS = 250;
const DEFAULT_EVIDENCE_SESSION_RETRY_COUNT = 3;
const DEFAULT_EVIDENCE_SESSION_RETRY_DELAY_MS = 1_000;

const DIRECT_AUTH_SUCCESS = "AUTH_SUCCESS";
const EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF = "vgsqgxpwjnwssconsptn";
const SUPABASE_PUBLISHABLE_KEY_REGEX = /^sb_publishable_[A-Za-z0-9_-]+$/;
const SUPABASE_ANON_JWT_REGEX = /^eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const ALLOWED_AUTH_ERROR_CODES = new Set([
  "invalid_credentials",
  "email_not_confirmed",
  "user_banned",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "captcha_failed",
  "validation_failed",
  "auth_server_error",
  "unknown_auth_error",
]);

export class ProductionPostLiveProbeFailure extends Error {
  constructor(code, details = null) {
    super(code);
    this.name = "ProductionPostLiveProbeFailure";
    this.code = code;
    this.details = details;
  }
}

function fail(code, details = null) {
  throw new ProductionPostLiveProbeFailure(code, details);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTruthy(check, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return true;
    } catch {
      // keep polling
    }
    await sleep(pollMs);
  }
  return false;
}

function parseUrlSafe(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function boundedPositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return number;
}

function createLoginDiagnostics() {
  return {
    directSupabaseAuthAttempted: false,
    directSupabaseAuthOutcome: null,
    directSupabaseAuthKeyType: null,
    directSupabaseProjectMatchVerified: false,
    submitReadyObserved: false,
    submitAttempted: false,
    loginAlertObserved: false,
    loginFormErrorObserved: false,
    loginCallbackAlertObserved: false,
    globalAlertObserved: false,
    loginInvalidObserved: false,
    loginAuthErrorCode: null,
    navToHarmonyObserved: false,
    finalPathname: null,
    finalOriginMatched: null,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    failedRelevantRequestCount: 0,
    relevantResponseStatuses: [],
  };
}

function rememberRelevantResponse(diagnostics, route, status) {
  if (diagnostics.relevantResponseStatuses.length >= 12) return;
  diagnostics.relevantResponseStatuses.push({ route, status: Number(status) || 0 });
}

function classifyRelevantRoute(url, expectedOrigin) {
  if (!url || url.origin !== expectedOrigin) return null;
  if (url.pathname.startsWith("/login")) return "login";
  if (url.pathname.startsWith("/harmony")) return "harmony";
  if (url.pathname.startsWith("/api/admin/certification/evidence")) return "evidence";
  return null;
}

function attachPageDiagnostics(page, expectedOrigin, diagnostics) {
  if (!page || typeof page.on !== "function") return;

  page.on("console", (message) => {
    if (typeof message?.type === "function" && message.type() === "error") {
      diagnostics.consoleErrorCount += 1;
    }
  });

  page.on("pageerror", () => {
    diagnostics.pageErrorCount += 1;
  });

  page.on("requestfailed", (request) => {
    const parsed = parseUrlSafe(typeof request?.url === "function" ? request.url() : "");
    const route = classifyRelevantRoute(parsed, expectedOrigin);
    if (route) diagnostics.failedRelevantRequestCount += 1;
  });

  page.on("response", (response) => {
    const parsed = parseUrlSafe(typeof response?.url === "function" ? response.url() : "");
    const route = classifyRelevantRoute(parsed, expectedOrigin);
    if (!route) return;
    const status = typeof response.status === "function" ? response.status() : response.status;
    rememberRelevantResponse(diagnostics, route, status);
  });
}

async function locatorVisible(locator) {
  try {
    if (typeof locator?.first === "function") {
      return await locator.first().isVisible();
    }
    if (typeof locator?.isVisible === "function") {
      return await locator.isVisible();
    }
    if (typeof locator?.count === "function") {
      return (await locator.count()) > 0;
    }
  } catch {
    return false;
  }
  return false;
}

async function locatorAttribute(locator, name) {
  try {
    if (typeof locator?.first === "function" && typeof locator.first()?.getAttribute === "function") {
      return await locator.first().getAttribute(name);
    }
    if (typeof locator?.getAttribute === "function") {
      return await locator.getAttribute(name);
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeAuthErrorCode(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!ALLOWED_AUTH_ERROR_CODES.has(normalized)) return null;
  return normalized;
}

export function normalizeDirectSupabaseAuthError(error) {
  const code = typeof error?.code === "string" ? error.code.trim() : "";
  if (ALLOWED_AUTH_ERROR_CODES.has(code)) return code;
  if (code === "unexpected_failure") return "auth_server_error";
  if (typeof error?.status === "number" && error.status >= 500) return "auth_server_error";
  return "unknown_auth_error";
}

function canonicalSupabaseProjectRef(supabaseUrl) {
  let parsed;
  try {
    parsed = new URL(String(supabaseUrl));
  } catch {
    fail("production_supabase_url_invalid");
  }

  if (parsed.protocol !== "https:") {
    fail("production_supabase_url_invalid");
  }

  const host = parsed.hostname.toLowerCase();
  const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
  if (!match) {
    fail("production_supabase_url_invalid");
  }
  return match[1];
}

export function resolveDeterministicPublicSupabaseAuthConfig({
  supabaseUrl,
  supabasePublicAuthKey,
}) {
  const expectedProjectRef = EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF;
  const actualProjectRef = canonicalSupabaseProjectRef(supabaseUrl);

  if (actualProjectRef !== expectedProjectRef) {
    fail("production_supabase_project_mismatch");
  }

  const normalizedKey = typeof supabasePublicAuthKey === "string"
    ? supabasePublicAuthKey.trim()
    : "";

  if (!normalizedKey) {
    fail("production_supabase_public_key_missing");
  }

  if (SUPABASE_PUBLISHABLE_KEY_REGEX.test(normalizedKey)) {
    return {
      supabasePublicAuthKey: normalizedKey,
      keyType: "publishable",
      expectedProjectRef,
      projectMatchVerified: true,
    };
  }

  if (SUPABASE_ANON_JWT_REGEX.test(normalizedKey)) {
    return {
      supabasePublicAuthKey: normalizedKey,
      keyType: "anon_jwt",
      expectedProjectRef,
      projectMatchVerified: true,
    };
  }

  fail("production_supabase_public_key_invalid");
}

export async function runDirectSupabasePasswordAuthDiagnostic({
  supabaseUrl,
  supabasePublicAuthKey,
  email,
  password,
}) {
  const { createClient } = await import("@supabase/supabase-js");

  const supabase = createClient(supabaseUrl, supabasePublicAuthKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      outcome: normalizeDirectSupabaseAuthError(error),
      authenticated: false,
    };
  }

  const authenticated = Boolean(data?.session?.user || data?.user);
  if (authenticated) {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore local sign-out errors; session is non-persistent
    }
  }

  return {
    outcome: authenticated ? DIRECT_AUTH_SUCCESS : "unknown_auth_error",
    authenticated,
  };
}

async function waitForLoginOutcome({
  page,
  expectedOrigin,
  timeoutMs,
  pollMs,
  diagnostics,
}) {
  const loginFormErrorLocator = page.locator("#login-form-message");
  const callbackAlertLocator = page.locator('p[role="alert"]:not(#login-form-message)');
  const globalAlertLocator = page.locator('[role="alert"]:not(#login-form-message)');
  const invalidLocator = page.locator('input[aria-invalid="true"]');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const currentUrl = parseUrlSafe(page.url());
    if (!currentUrl) {
      await sleep(pollMs);
      continue;
    }

    diagnostics.finalPathname = currentUrl.pathname;
    diagnostics.finalOriginMatched = currentUrl.origin === expectedOrigin;

    if (currentUrl.origin !== expectedOrigin) {
      fail("post_login_redirect_invalid", diagnostics);
    }

    if (currentUrl.pathname.startsWith("/harmony")) {
      diagnostics.navToHarmonyObserved = true;
      return "success";
    }

    if (currentUrl.pathname.startsWith("/login")) {
      const [loginFormErrorVisible, callbackAlertVisible, globalAlertVisible, invalidVisible] = await Promise.all([
        locatorVisible(loginFormErrorLocator),
        locatorVisible(callbackAlertLocator),
        locatorVisible(globalAlertLocator),
        locatorVisible(invalidLocator),
      ]);

      let normalizedAuthErrorCode = null;
      if (loginFormErrorVisible) {
        const rawAuthErrorCode = await locatorAttribute(loginFormErrorLocator, "data-auth-error-code");
        normalizedAuthErrorCode = normalizeAuthErrorCode(rawAuthErrorCode);
      }

      diagnostics.loginAlertObserved ||= loginFormErrorVisible || globalAlertVisible;
      diagnostics.loginFormErrorObserved ||= loginFormErrorVisible;
      diagnostics.loginCallbackAlertObserved ||= callbackAlertVisible;
      diagnostics.globalAlertObserved ||= globalAlertVisible;
      diagnostics.loginInvalidObserved ||= invalidVisible;
      if (!diagnostics.loginAuthErrorCode && normalizedAuthErrorCode) {
        diagnostics.loginAuthErrorCode = normalizedAuthErrorCode;
      }

      if (loginFormErrorVisible || invalidVisible) {
        return "auth_rejected";
      }
    }

    await sleep(pollMs);
  }

  return "timeout";
}

function sanitizeFailureDetails(details) {
  if (!details || typeof details !== "object") return null;
  const sanitizedDirectOutcome = details.directSupabaseAuthOutcome === DIRECT_AUTH_SUCCESS
    ? DIRECT_AUTH_SUCCESS
    : normalizeAuthErrorCode(details.directSupabaseAuthOutcome);

  const allowed = {
    directSupabaseAuthAttempted: Boolean(details.directSupabaseAuthAttempted),
    directSupabaseAuthOutcome: sanitizedDirectOutcome,
    directSupabaseAuthKeyType:
      details.directSupabaseAuthKeyType === "publishable"
      || details.directSupabaseAuthKeyType === "anon_jwt"
        ? details.directSupabaseAuthKeyType
        : null,
    directSupabaseProjectMatchVerified: Boolean(details.directSupabaseProjectMatchVerified),
    submitReadyObserved: Boolean(details.submitReadyObserved),
    submitAttempted: Boolean(details.submitAttempted),
    loginAlertObserved: Boolean(details.loginAlertObserved),
    loginFormErrorObserved: Boolean(details.loginFormErrorObserved),
    loginCallbackAlertObserved: Boolean(details.loginCallbackAlertObserved),
    globalAlertObserved: Boolean(details.globalAlertObserved),
    loginInvalidObserved: Boolean(details.loginInvalidObserved),
    loginAuthErrorCode: normalizeAuthErrorCode(details.loginAuthErrorCode),
    navToHarmonyObserved: Boolean(details.navToHarmonyObserved),
    finalPathname: typeof details.finalPathname === "string" ? details.finalPathname : null,
    finalOriginMatched: typeof details.finalOriginMatched === "boolean" ? details.finalOriginMatched : null,
    consoleErrorCount: Number.isInteger(details.consoleErrorCount) ? details.consoleErrorCount : 0,
    pageErrorCount: Number.isInteger(details.pageErrorCount) ? details.pageErrorCount : 0,
    failedRelevantRequestCount: Number.isInteger(details.failedRelevantRequestCount) ? details.failedRelevantRequestCount : 0,
    relevantResponseStatuses: Array.isArray(details.relevantResponseStatuses)
      ? details.relevantResponseStatuses
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            route: typeof entry.route === "string" ? entry.route : "unknown",
            status: Number.isInteger(entry.status) ? entry.status : 0,
          }))
          .slice(0, 12)
      : [],
  };
  return allowed;
}

export async function probeProductionPostLive({
  browser,
  productionFqdn,
  targetSha,
  verifiedAt = new Date().toISOString(),
  supabaseUrl,
  supabasePublicAuthKey,
  email,
  password,
  timingOverrides = {},
  directSupabaseAuthDiagnostic = runDirectSupabasePasswordAuthDiagnostic,
}) {
  const normalizedTargetSha = validateTargetSha(targetSha);
  const productionOrigin = buildProductionOriginFromFqdn(productionFqdn);

  if (!browser || typeof browser.newContext !== "function") fail("browser_unavailable");
  if (typeof supabaseUrl !== "string" || supabaseUrl.trim().length === 0) fail("production_supabase_url_missing");
  if (typeof email !== "string" || email.trim().length === 0) fail("missing_credentials");
  if (typeof password !== "string" || password.length === 0) fail("missing_credentials");

  const loginHydrationTimeoutMs = boundedPositiveInteger(
    timingOverrides.loginHydrationTimeoutMs,
    DEFAULT_LOGIN_HYDRATION_TIMEOUT_MS,
  );
  const loginRedirectTimeoutMs = boundedPositiveInteger(
    timingOverrides.loginRedirectTimeoutMs,
    DEFAULT_LOGIN_REDIRECT_TIMEOUT_MS,
  );
  const pollIntervalMs = boundedPositiveInteger(
    timingOverrides.pollIntervalMs,
    DEFAULT_LOGIN_POLL_INTERVAL_MS,
  );
  const evidenceSessionRetryCount = boundedPositiveInteger(
    timingOverrides.evidenceSessionRetryCount,
    DEFAULT_EVIDENCE_SESSION_RETRY_COUNT,
  );
  const evidenceSessionRetryDelayMs = boundedPositiveInteger(
    timingOverrides.evidenceSessionRetryDelayMs,
    DEFAULT_EVIDENCE_SESSION_RETRY_DELAY_MS,
  );

  const loginDiagnostics = createLoginDiagnostics();

  const runtimePublicAuthConfig = resolveDeterministicPublicSupabaseAuthConfig({
    supabaseUrl,
    supabasePublicAuthKey,
  });

  loginDiagnostics.directSupabaseAuthAttempted = true;
  loginDiagnostics.directSupabaseAuthKeyType = runtimePublicAuthConfig.keyType;
  loginDiagnostics.directSupabaseProjectMatchVerified = runtimePublicAuthConfig.projectMatchVerified === true;

  let directAuthResult;
  try {
    directAuthResult = await directSupabaseAuthDiagnostic({
      supabaseUrl,
      supabasePublicAuthKey: runtimePublicAuthConfig.supabasePublicAuthKey,
      email,
      password,
    });
  } catch {
    fail("production_direct_supabase_auth_failed", loginDiagnostics);
  }

  const normalizedDirectOutcome = directAuthResult?.outcome === DIRECT_AUTH_SUCCESS
    ? DIRECT_AUTH_SUCCESS
    : normalizeAuthErrorCode(directAuthResult?.outcome) ?? "unknown_auth_error";

  loginDiagnostics.directSupabaseAuthOutcome = normalizedDirectOutcome;

  if (normalizedDirectOutcome !== DIRECT_AUTH_SUCCESS || directAuthResult?.authenticated !== true) {
    fail("production_direct_supabase_auth_rejected", loginDiagnostics);
  }

  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  try {
    const page = await context.newPage();
    const loginUrl = new URL("/login?redirect=%2Fharmony", productionOrigin).toString();
    const expectedOrigin = new URL(productionOrigin).origin;
    attachPageDiagnostics(page, expectedOrigin, loginDiagnostics);

    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (new URL(page.url()).origin !== expectedOrigin) {
      fail("pre_login_origin_mismatch", loginDiagnostics);
    }

    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await Promise.all([
      emailInput.waitFor({ state: "visible", timeout: loginHydrationTimeoutMs }),
      passwordInput.waitFor({ state: "visible", timeout: loginHydrationTimeoutMs }),
      submitButton.waitFor({ state: "visible", timeout: loginHydrationTimeoutMs }),
    ]);

    const submitReady = await waitForTruthy(async () => {
      const [emailEnabled, passwordEnabled, submitEnabled] = await Promise.all([
        emailInput.isEnabled(),
        passwordInput.isEnabled(),
        submitButton.isEnabled(),
      ]);
      return emailEnabled && passwordEnabled && submitEnabled;
    }, loginHydrationTimeoutMs, pollIntervalMs);

    if (!submitReady) {
      fail("production_login_submit_not_ready", loginDiagnostics);
    }
    loginDiagnostics.submitReadyObserved = true;

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await submitButton.click();
    loginDiagnostics.submitAttempted = true;

    const loginOutcome = await waitForLoginOutcome({
      page,
      expectedOrigin,
      timeoutMs: loginRedirectTimeoutMs,
      pollMs: pollIntervalMs,
      diagnostics: loginDiagnostics,
    });

    if (loginOutcome === "auth_rejected") {
      fail("production_login_auth_rejected", loginDiagnostics);
    }

    if (loginOutcome === "timeout") {
      fail("production_login_redirect_timeout", loginDiagnostics);
    }

    const finalUrl = new URL(page.url());
    if (finalUrl.origin !== expectedOrigin || !finalUrl.pathname.startsWith("/harmony")) {
      fail("post_login_redirect_invalid", loginDiagnostics);
    }

    let evidenceResponse = null;
    for (let attempt = 1; attempt <= evidenceSessionRetryCount; attempt += 1) {
      evidenceResponse = await context.request.get(
        new URL("/api/admin/certification/evidence?probe=operational", productionOrigin).toString(),
        { headers: { Accept: "application/json" }, timeout: 60_000 },
      );

      const status = typeof evidenceResponse.status === "function"
        ? evidenceResponse.status()
        : evidenceResponse.status;

      if (status === 401 || status === 403) {
        if (attempt < evidenceSessionRetryCount) {
          await sleep(evidenceSessionRetryDelayMs);
          continue;
        }
        fail("production_login_session_not_established", loginDiagnostics);
      }

      break;
    }

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
      loginDiagnostics,
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
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublicAuthKey = process.env.AIOS_PRODUCTION_SUPABASE_PUBLIC_KEY;
  const email = process.env.AIOS_PRODUCTION_CERT_FOUNDER_EMAIL;
  const password = process.env.AIOS_PRODUCTION_CERT_FOUNDER_PASSWORD;

  if (!email || !password) fail("missing_credentials");
  if (!supabaseUrl) fail("production_supabase_url_missing");
  if (!supabasePublicAuthKey) fail("production_supabase_public_key_missing");

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const result = await probeProductionPostLive({
      browser,
      productionFqdn,
      targetSha,
      supabaseUrl,
      supabasePublicAuthKey,
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
    const safeDetails = sanitizeFailureDetails(error?.details);
    if (safeDetails) {
      try {
        console.error(JSON.stringify({ probeDiagnostics: safeDetails }));
      } catch {
        // ignore serialization issues
      }
    }
    const code = error?.code ?? "production_post_live_probe_failed";
    console.error(code);
    process.exit(1);
  });
}
