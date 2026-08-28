import { describe, expect, it } from "vitest";
import {
  ProductionPostLiveProbeFailure,
  buildProductionOriginFromFqdn,
  normalizeDirectSupabaseAuthError,
  probeProductionPostLive,
  validateProductionFqdn,
  validateTargetSha,
} from "../../scripts/ci/production-post-live-probe.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const FQDN = "aios-runtime-prod.eastus.azurecontainerapps.io";
const SUPABASE_URL = "https://vgsqgxpwjnwssconsptn.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_runtime_config_stub";
const CONDITION_ID = "a".repeat(64);
const OUTCOME_ID = "b".repeat(64);

const DIRECT_AUTH_SUCCESS_RESULT = {
  outcome: "AUTH_SUCCESS",
  authenticated: true,
} as const;

async function probeWithDefaults(
  overrides: Parameters<typeof probeProductionPostLive>[0],
  options?: {
    directSupabaseAuthDiagnostic?: Parameters<typeof probeProductionPostLive>[0]["directSupabaseAuthDiagnostic"];
  },
) {
  const directSupabaseAuthDiagnostic = options?.directSupabaseAuthDiagnostic
    ?? (async () => DIRECT_AUTH_SUCCESS_RESULT);

  return probeProductionPostLive({
    supabaseUrl: SUPABASE_URL,
    supabasePublicAuthKey: SUPABASE_PUBLIC_KEY,
    directSupabaseAuthDiagnostic,
    ...overrides,
  });
}

function payload(overrides = {}) {
  return {
    certification: {
      details: {
        operationalRuntimeLive: {
          runtimeCondition: { conditionId: CONDITION_ID },
          outcomeId: OUTCOME_ID,
          deploymentSha: SHA,
          deploymentEnvironment: "production",
          certifiable: true,
          summary: {
            componentCount: 6,
            healthy: 6,
            degraded: 0,
            blocked: 0,
            unavailable: 0,
            unknown: 0,
          },
          foundation: [
            "harmony_orchestration",
            "julius_retrieval",
            "connector_runtime",
            "approval_runtime",
            "supabase_runtime",
            "event_mesh_runtime",
          ].map((component) => ({
            component,
            status: "healthy",
            evidenceType: "authenticated_runtime_proof",
            details: { liveProbeAttempted: true },
            runtimeConditionId: CONDITION_ID,
            latencyBucket: "under_1s",
          })),
        },
      },
    },
    ...overrides,
  };
}

function fakeBrowser({
  postUrl = `https://${FQDN}/harmony`,
  initialUrl = null,
  status = 200,
  statusSequence = null,
  responsePayload = payload(),
  hydrationDelayMs = 0,
  submitEnabled = true,
  redirectDelayMs = 0,
  loginFormErrorVisible = false,
  loginFormAuthErrorCode = null,
  callbackAlertVisible = false,
  globalAlertVisible = false,
  invalidInputVisible = false,
  consoleErrorCount = 0,
  pageErrorCount = 0,
  relevantFailedRequestCount = 0,
} = {}) {
  const state = {
    filledSelectors: [],
    gotUrls: [],
    requestUrls: [],
    responseStatuses: [],
    closed: false,
    newContextCalls: 0,
    gotoAt: 0,
    requestAttempt: 0,
    listeners: {
      console: [],
      pageerror: [],
      requestfailed: [],
      response: [],
    },
  };

  function emit(event, payload) {
    const handlers = state.listeners[event] ?? [];
    for (const handler of handlers) {
      handler(payload);
    }
  }

  function statusForAttempt(attempt) {
    if (Array.isArray(statusSequence) && statusSequence.length > 0) {
      const value = statusSequence[Math.min(attempt, statusSequence.length - 1)];
      return Number(value) || 0;
    }
    return status;
  }

  function makeLocator(selector) {
    return {
      async fill() {
        state.filledSelectors.push(selector);
      },
      async click() {
        state.filledSelectors.push(selector);
        if (redirectDelayMs > 0) {
          setTimeout(() => {
            page.currentUrl = postUrl;
          }, redirectDelayMs);
          return;
        }
        page.currentUrl = postUrl;
      },
      async waitFor() {
        return;
      },
      async isEnabled() {
        if (selector === 'button[type="submit"]') {
          if (!submitEnabled) return false;
          return Date.now() - state.gotoAt >= hydrationDelayMs;
        }
        return true;
      },
      async isVisible() {
        if (selector === "#login-form-message") return loginFormErrorVisible;
        if (selector === 'p[role="alert"]:not(#login-form-message)') return callbackAlertVisible;
        if (selector === '[role="alert"]:not(#login-form-message)') {
          return callbackAlertVisible || globalAlertVisible;
        }
        if (selector === 'input[aria-invalid="true"]') return invalidInputVisible;
        return true;
      },
      async getAttribute(name) {
        if (selector === "#login-form-message" && name === "data-auth-error-code") {
          return loginFormAuthErrorCode;
        }
        return null;
      },
      async count() {
        if (selector === "#login-form-message") return loginFormErrorVisible ? 1 : 0;
        if (selector === 'p[role="alert"]:not(#login-form-message)') return callbackAlertVisible ? 1 : 0;
        if (selector === '[role="alert"]:not(#login-form-message)') {
          return callbackAlertVisible || globalAlertVisible ? 1 : 0;
        }
        if (selector === 'input[aria-invalid="true"]') return invalidInputVisible ? 1 : 0;
        return 1;
      },
      first() {
        return makeLocator(selector);
      },
    };
  }

  const page = {
    currentUrl: "",
    on(event, handler) {
      state.listeners[event].push(handler);
    },
    async goto(url) {
      state.gotUrls.push(url);
      state.gotoAt = Date.now();
      this.currentUrl = initialUrl ?? url;
      for (let i = 0; i < consoleErrorCount; i += 1) {
        emit("console", { type: () => "error" });
      }
      for (let i = 0; i < pageErrorCount; i += 1) {
        emit("pageerror", new Error("page_error"));
      }
      for (let i = 0; i < relevantFailedRequestCount; i += 1) {
        emit("requestfailed", { url: () => `https://${FQDN}/login` });
      }
    },
    locator(selector) {
      return makeLocator(selector);
    },
    url() {
      return page.currentUrl;
    },
  };

  const context = {
    async newPage() {
      return page;
    },
    request: {
      async get(url) {
        state.requestUrls.push(url);
        const currentStatus = statusForAttempt(state.requestAttempt);
        state.requestAttempt += 1;
        state.responseStatuses.push(currentStatus);
        emit("response", {
          url: () => url,
          status: () => currentStatus,
        });
        return {
          status: () => currentStatus,
          ok: () => currentStatus >= 200 && currentStatus < 300,
          async json() {
            return responsePayload;
          },
        };
      },
    },
    async close() {
      state.closed = true;
    },
  };

  return {
    state,
    value: {
      async newContext() {
        state.newContextCalls += 1;
        return context;
      },
    },
  };
}

async function expectFailure(code, action) {
  await expect(action).rejects.toMatchObject({
    name: "ProductionPostLiveProbeFailure",
    code,
  });
}

describe("production post-live probe", () => {
  it("validates fqdn and target sha", () => {
    expect(validateTargetSha(SHA)).toBe(SHA);
    expect(() => validateTargetSha("HEAD")).toThrowError("invalid_target_sha");
    expect(validateProductionFqdn(FQDN)).toBe(FQDN);
    expect(() => validateProductionFqdn("https://x")).toThrowError("invalid_production_fqdn");
    expect(buildProductionOriginFromFqdn(FQDN)).toBe(`https://${FQDN}/`);
  });

  it("normalizes direct supabase auth errors", () => {
    expect(normalizeDirectSupabaseAuthError({ code: "invalid_credentials", status: 400 })).toBe("invalid_credentials");
    expect(normalizeDirectSupabaseAuthError({ code: "over_request_rate_limit", status: 429 })).toBe("over_request_rate_limit");
    expect(normalizeDirectSupabaseAuthError({ code: "some_new_error", status: 400 })).toBe("unknown_auth_error");
    expect(normalizeDirectSupabaseAuthError({ code: "unexpected_failure", status: 500 })).toBe("auth_server_error");
  });

  it("skips browser probe when direct supabase auth rejects credentials", async () => {
    const browser = fakeBrowser();

    await expect(async () => {
      await probeWithDefaults({
        browser: browser.value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email: "founder@example.invalid",
        password: "x",
      }, {
        directSupabaseAuthDiagnostic: async () => ({
          outcome: "invalid_credentials",
          authenticated: false,
        }),
      });
    }).rejects.toMatchObject({
      code: "production_direct_supabase_auth_rejected",
      details: expect.objectContaining({
        directSupabaseAuthAttempted: true,
        directSupabaseAuthOutcome: "invalid_credentials",
      }),
    });

    expect(browser.state.newContextCalls).toBe(0);
    expect(browser.state.gotUrls).toEqual([]);
  });

  it("continues to browser probe after direct supabase auth success", async () => {
    const browser = fakeBrowser();
    const result = await probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      verifiedAt: "2026-08-10T11:00:00.000Z",
    });

    expect(result.loginDiagnostics.directSupabaseAuthAttempted).toBe(true);
    expect(result.loginDiagnostics.directSupabaseAuthOutcome).toBe("AUTH_SUCCESS");
    expect(result.loginDiagnostics.directSupabaseProjectMatchVerified).toBe(true);
    expect(browser.state.newContextCalls).toBe(1);
    expect(browser.state.gotUrls[0]).toBe(`https://${FQDN}/login?redirect=%2Fharmony`);
  });

  it("does not require runtime asset scraping for deterministic public-key auth", async () => {
    const browser = fakeBrowser();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network_blocked");
    };

    try {
      const result = await probeWithDefaults({
        browser: browser.value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email: "founder@example.invalid",
        password: "x",
      });

      expect(result.loginDiagnostics.directSupabaseAuthOutcome).toBe("AUTH_SUCCESS");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed when deterministic public key is missing", async () => {
    const browser = fakeBrowser();
    await expectFailure("production_supabase_public_key_missing", () => probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      supabasePublicAuthKey: "",
      email: "founder@example.invalid",
      password: "x",
    }));

    expect(browser.state.newContextCalls).toBe(0);
  });

  it("fails closed when Supabase URL does not match governed production project", async () => {
    const browser = fakeBrowser();
    await expectFailure("production_supabase_project_mismatch", () => probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      supabaseUrl: "https://wrongproject.supabase.co",
      email: "founder@example.invalid",
      password: "x",
    }));

    expect(browser.state.newContextCalls).toBe(0);
  });

  it("reuses normal password login selectors and same browser context request flow", async () => {
    const browser = fakeBrowser();
    const result = await probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "not-logged",
      verifiedAt: "2026-08-10T11:00:00.000Z",
    });

    expect(browser.state.gotUrls[0]).toBe(`https://${FQDN}/login?redirect=%2Fharmony`);
    expect(browser.state.filledSelectors).toEqual([
      'input[name="email"]',
      'input[name="password"]',
      'button[type="submit"]',
    ]);
    expect(browser.state.requestUrls[0]).toBe(`https://${FQDN}/api/admin/certification/evidence?probe=operational`);
    expect(browser.state.closed).toBe(true);

    expect(result.authenticatedSession).toBe(true);
    expect(result.founderAuthorized).toBe(true);
    expect(result.originMatched).toBe(true);
    expect(result.operationalRuntimeSummary.componentCount).toBe(6);
    expect(result.operationalRuntimeSummary.healthy).toBe(6);
    expect(result.operationalRuntimeSummary.runtimeCondition.conditionId).toBe(CONDITION_ID);
    expect(result.operationalRuntimeSummary.outcomeId).toBe(OUTCOME_ID);
    expect(result.operationalRuntimeFoundation).toHaveLength(6);
  });

  it("fails closed before filling credentials on cross-origin pre-login redirect", async () => {
    const browser = fakeBrowser({ initialUrl: "https://evil.example/login?redirect=%2Fharmony" });
    await expectFailure("pre_login_origin_mismatch", () => probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));
    expect(browser.state.filledSelectors).toEqual([]);
  });

  it("fails closed on unrecoverable session establishment and invalid evidence guarantees", async () => {
    await expectFailure("production_login_session_not_established", () => probeWithDefaults({
      browser: fakeBrowser({ statusSequence: [401, 401, 401] }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        evidenceSessionRetryCount: 3,
        evidenceSessionRetryDelayMs: 1,
      },
    }));

    await expectFailure("production_login_session_not_established", () => probeWithDefaults({
      browser: fakeBrowser({ statusSequence: [403, 403, 403] }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        evidenceSessionRetryCount: 3,
        evidenceSessionRetryDelayMs: 1,
      },
    }));

    await expectFailure("operational_runtime_live_sha_mismatch", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: payload({ certification: { details: { operationalRuntimeLive: { ...payload().certification.details.operationalRuntimeLive, deploymentSha: "a".repeat(40) } } } }) }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    await expectFailure("operational_runtime_live_environment_mismatch", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: payload({ certification: { details: { operationalRuntimeLive: { ...payload().certification.details.operationalRuntimeLive, deploymentEnvironment: "staging" } } } }) }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));
  });

  it("requires six healthy entries with canonical latency and a single runtimeConditionId", async () => {
    const p = payload();
    p.certification.details.operationalRuntimeLive.foundation[0].latencyBucket = "";
    await expectFailure("operational_runtime_live_latency_invalid", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: p }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    const p2 = payload();
    p2.certification.details.operationalRuntimeLive.foundation[1].runtimeConditionId = "cond-2";
    await expectFailure("operational_runtime_live_condition_mismatch", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: p2 }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    const p3 = payload();
    p3.certification.details.operationalRuntimeLive.foundation[2].status = "degraded";
    await expectFailure("operational_runtime_live_component_not_healthy", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: p3 }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));
  });

  it("requires runtimeCondition.conditionId and outcomeId bindings", async () => {
    const badCondition = payload({
      certification: {
        details: {
          operationalRuntimeLive: {
            ...payload().certification.details.operationalRuntimeLive,
            runtimeCondition: { conditionId: "invalid" },
          },
        },
      },
    });
    await expectFailure("operational_runtime_condition_id_invalid", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: badCondition }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    const badOutcome = payload({
      certification: {
        details: {
          operationalRuntimeLive: {
            ...payload().certification.details.operationalRuntimeLive,
            outcomeId: "zzz",
          },
        },
      },
    });
    await expectFailure("operational_runtime_outcome_id_invalid", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: badOutcome }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    const mismatch = payload({
      certification: {
        details: {
          operationalRuntimeLive: {
            ...payload().certification.details.operationalRuntimeLive,
            foundation: payload().certification.details.operationalRuntimeLive.foundation.map((entry, index) =>
              index === 0 ? { ...entry, runtimeConditionId: "c".repeat(64) } : entry,
            ),
          },
        },
      },
    });
    await expectFailure("operational_runtime_live_condition_mismatch", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: mismatch }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));
  });

  it("never leaks credential-like fields in the allowlisted output", async () => {
    const browser = fakeBrowser();
    const result = await probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "secret",
    });

    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("authorization");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("userid");
    expect(serialized).not.toContain("companyid");
  });

  it("blocks exact credential value leakage in returned allowlisted evidence", async () => {
    const leakedEmail = "leak@example.invalid";
    const leakedPassword = "leak-secret";

    const emailLeakPayload = payload({
      certification: {
        details: {
          operationalRuntimeLive: {
            ...payload().certification.details.operationalRuntimeLive,
            foundation: payload().certification.details.operationalRuntimeLive.foundation.map((entry, index) =>
              index === 0 ? { ...entry, safeMessage: leakedEmail } : entry,
            ),
          },
        },
      },
    });

    await expectFailure("credential_email_leaked", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: emailLeakPayload }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: leakedEmail,
      password: leakedPassword,
    }));

    const passwordLeakPayload = payload({
      certification: {
        details: {
          operationalRuntimeLive: {
            ...payload().certification.details.operationalRuntimeLive,
            foundation: payload().certification.details.operationalRuntimeLive.foundation.map((entry, index) =>
              index === 1 ? { ...entry, safeMessage: leakedPassword } : entry,
            ),
          },
        },
      },
    });

    await expectFailure("credential_password_leaked", () => probeWithDefaults({
      browser: fakeBrowser({ responsePayload: passwordLeakPayload }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: leakedEmail,
      password: leakedPassword,
    }));
  });

  it("handles delayed hydration and still logs in successfully", async () => {
    const browser = fakeBrowser({ hydrationDelayMs: 50 });
    const result = await probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        loginHydrationTimeoutMs: 300,
        loginRedirectTimeoutMs: 500,
        pollIntervalMs: 20,
      },
    });

    expect(result.authenticatedSession).toBe(true);
    expect(result.loginDiagnostics.submitReadyObserved).toBe(true);
    expect(result.loginDiagnostics.submitAttempted).toBe(true);
    expect(result.loginDiagnostics.navToHarmonyObserved).toBe(true);
  });

  it("handles successful auth with delayed redirect and delayed session establishment", async () => {
    const browser = fakeBrowser({
      redirectDelayMs: 120,
      statusSequence: [401, 200],
    });

    const result = await probeWithDefaults({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        loginHydrationTimeoutMs: 300,
        loginRedirectTimeoutMs: 700,
        pollIntervalMs: 20,
        evidenceSessionRetryCount: 3,
        evidenceSessionRetryDelayMs: 10,
      },
    });

    expect(result.authenticatedSession).toBe(true);
    expect(browser.state.responseStatuses).toEqual([401, 200]);
  });

  it("does not classify unrelated visible alerts as authentication rejection", async () => {
    await expect(async () => {
      await probeWithDefaults({
        browser: fakeBrowser({
          postUrl: `https://${FQDN}/login?redirect=%2Fharmony`,
          globalAlertVisible: true,
        }).value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email: "founder@example.invalid",
        password: "x",
        timingOverrides: {
          loginHydrationTimeoutMs: 300,
          loginRedirectTimeoutMs: 240,
          pollIntervalMs: 20,
        },
      });
    }).rejects.toMatchObject({
      code: "production_login_redirect_timeout",
      details: expect.objectContaining({
        globalAlertObserved: true,
        loginFormErrorObserved: false,
        loginInvalidObserved: false,
      }),
    });
  });

  it("does not classify callback banner alerts as password rejection", async () => {
    await expect(async () => {
      await probeWithDefaults({
        browser: fakeBrowser({
          postUrl: `https://${FQDN}/login?redirect=%2Fharmony`,
          callbackAlertVisible: true,
        }).value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email: "founder@example.invalid",
        password: "x",
        timingOverrides: {
          loginHydrationTimeoutMs: 300,
          loginRedirectTimeoutMs: 240,
          pollIntervalMs: 20,
        },
      });
    }).rejects.toMatchObject({
      code: "production_login_redirect_timeout",
      details: expect.objectContaining({
        loginCallbackAlertObserved: true,
        loginFormErrorObserved: false,
        loginInvalidObserved: false,
      }),
    });
  });

  it("detects explicit authentication rejection from login-form error and invalid state", async () => {
    await expect(async () => {
      await probeWithDefaults({
        browser: fakeBrowser({
          postUrl: `https://${FQDN}/login?redirect=%2Fharmony`,
          loginFormErrorVisible: true,
          loginFormAuthErrorCode: "invalid_credentials",
          invalidInputVisible: true,
        }).value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email: "founder@example.invalid",
        password: "x",
        timingOverrides: {
          loginHydrationTimeoutMs: 300,
          loginRedirectTimeoutMs: 500,
          pollIntervalMs: 20,
        },
      });
    }).rejects.toMatchObject({
      code: "production_login_auth_rejected",
      details: expect.objectContaining({
        loginAuthErrorCode: "invalid_credentials",
      }),
    });
  });

  it("drops non-allowlisted login-form auth error code from diagnostics", async () => {
    await expect(async () => {
      await probeWithDefaults({
        browser: fakeBrowser({
          postUrl: `https://${FQDN}/login?redirect=%2Fharmony`,
          loginFormErrorVisible: true,
          loginFormAuthErrorCode: "raw_message_with_sensitive_text",
          invalidInputVisible: true,
        }).value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email: "founder@example.invalid",
        password: "x",
        timingOverrides: {
          loginHydrationTimeoutMs: 300,
          loginRedirectTimeoutMs: 500,
          pollIntervalMs: 20,
        },
      });
    }).rejects.toMatchObject({
      code: "production_login_auth_rejected",
      details: expect.objectContaining({
        loginAuthErrorCode: null,
      }),
    });
  });

  it("fails when login form rejects without a normalized auth code", async () => {
    await expectFailure("production_login_auth_rejected", () => probeWithDefaults({
      browser: fakeBrowser({
        postUrl: `https://${FQDN}/login?redirect=%2Fharmony`,
        loginFormErrorVisible: true,
        invalidInputVisible: true,
      }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        loginHydrationTimeoutMs: 300,
        loginRedirectTimeoutMs: 500,
        pollIntervalMs: 20,
      },
    }));
  });

  it("fails when login submit never becomes interactive", async () => {
    await expectFailure("production_login_submit_not_ready", () => probeWithDefaults({
      browser: fakeBrowser({ submitEnabled: false }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        loginHydrationTimeoutMs: 200,
        pollIntervalMs: 20,
      },
    }));
  });

  it("fails with redirect timeout when neither success nor explicit rejection is observed", async () => {
    await expectFailure("production_login_redirect_timeout", () => probeWithDefaults({
      browser: fakeBrowser({ postUrl: `https://${FQDN}/login?redirect=%2Fharmony` }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
      timingOverrides: {
        loginHydrationTimeoutMs: 300,
        loginRedirectTimeoutMs: 240,
        pollIntervalMs: 20,
      },
    }));
  });

  it("emits only safe non-secret diagnostics on failure", async () => {
    const email = "safe@example.invalid";
    const password = "safe-secret";

    await expect(async () => {
      await probeWithDefaults({
        browser: fakeBrowser({
          postUrl: `https://${FQDN}/login?redirect=%2Fharmony`,
          consoleErrorCount: 2,
          pageErrorCount: 1,
          relevantFailedRequestCount: 1,
        }).value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email,
        password,
        timingOverrides: {
          loginHydrationTimeoutMs: 300,
          loginRedirectTimeoutMs: 220,
          pollIntervalMs: 20,
        },
      });
    }).rejects.toMatchObject({
      code: "production_login_redirect_timeout",
      details: expect.objectContaining({
        submitReadyObserved: true,
        submitAttempted: true,
        consoleErrorCount: 2,
        pageErrorCount: 1,
        failedRelevantRequestCount: 1,
      }),
    });

    try {
      await probeWithDefaults({
        browser: fakeBrowser({ postUrl: `https://${FQDN}/login?redirect=%2Fharmony` }).value,
        productionFqdn: FQDN,
        targetSha: SHA,
        email,
        password,
        timingOverrides: {
          loginHydrationTimeoutMs: 300,
          loginRedirectTimeoutMs: 220,
          pollIntervalMs: 20,
        },
      });
    } catch (error) {
      const serialized = JSON.stringify(error.details ?? {}).toLowerCase();
      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain(password);
      expect(serialized).not.toContain("cookie");
      expect(serialized).not.toContain("token");
      expect(serialized).not.toContain("authorization");
    }
  });

  it("exports typed failure for callers", () => {
    const err = new ProductionPostLiveProbeFailure("code");
    expect(err.code).toBe("code");
  });
});
