import { describe, expect, it } from "vitest";
import {
  ProductionPostLiveProbeFailure,
  buildProductionOriginFromFqdn,
  probeProductionPostLive,
  validateProductionFqdn,
  validateTargetSha,
} from "../../scripts/ci/production-post-live-probe.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const FQDN = "aios-runtime-prod.eastus.azurecontainerapps.io";

function payload(overrides = {}) {
  return {
    certification: {
      details: {
        operationalRuntimeLive: {
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
            runtimeConditionId: "cond-1",
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
  responsePayload = payload(),
} = {}) {
  const state = {
    filledSelectors: [],
    gotUrls: [],
    requestUrls: [],
    closed: false,
  };

  const page = {
    currentUrl: "",
    async goto(url) {
      state.gotUrls.push(url);
      this.currentUrl = initialUrl ?? url;
    },
    locator(selector) {
      return {
        fill: async () => {
          state.filledSelectors.push(selector);
        },
        click: async () => {
          state.filledSelectors.push(selector);
          page.currentUrl = postUrl;
        },
      };
    },
    async waitForURL(predicate) {
      const ok = predicate(new URL(page.currentUrl));
      if (!ok) throw new Error("wait_fail");
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
        return {
          status: () => status,
          ok: () => status >= 200 && status < 300,
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

  it("reuses normal password login selectors and same browser context request flow", async () => {
    const browser = fakeBrowser();
    const result = await probeProductionPostLive({
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
    expect(result.operationalRuntimeFoundation).toHaveLength(6);
  });

  it("fails closed before filling credentials on cross-origin pre-login redirect", async () => {
    const browser = fakeBrowser({ initialUrl: "https://evil.example/login?redirect=%2Fharmony" });
    await expectFailure("pre_login_origin_mismatch", () => probeProductionPostLive({
      browser: browser.value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));
    expect(browser.state.filledSelectors).toEqual([]);
  });

  it("fails closed on 401/403 and invalid evidence guarantees", async () => {
    await expectFailure("operational_evidence_unauthorized", () => probeProductionPostLive({
      browser: fakeBrowser({ status: 401 }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    await expectFailure("operational_evidence_forbidden", () => probeProductionPostLive({
      browser: fakeBrowser({ status: 403 }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    await expectFailure("operational_runtime_live_sha_mismatch", () => probeProductionPostLive({
      browser: fakeBrowser({ responsePayload: payload({ certification: { details: { operationalRuntimeLive: { ...payload().certification.details.operationalRuntimeLive, deploymentSha: "a".repeat(40) } } } }) }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    await expectFailure("operational_runtime_live_environment_mismatch", () => probeProductionPostLive({
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
    await expectFailure("operational_runtime_live_latency_invalid", () => probeProductionPostLive({
      browser: fakeBrowser({ responsePayload: p }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    const p2 = payload();
    p2.certification.details.operationalRuntimeLive.foundation[1].runtimeConditionId = "cond-2";
    await expectFailure("operational_runtime_live_condition_mismatch", () => probeProductionPostLive({
      browser: fakeBrowser({ responsePayload: p2 }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));

    const p3 = payload();
    p3.certification.details.operationalRuntimeLive.foundation[2].status = "degraded";
    await expectFailure("operational_runtime_live_component_not_healthy", () => probeProductionPostLive({
      browser: fakeBrowser({ responsePayload: p3 }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: "founder@example.invalid",
      password: "x",
    }));
  });

  it("never leaks credential-like fields in the allowlisted output", async () => {
    const browser = fakeBrowser();
    const result = await probeProductionPostLive({
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

    await expectFailure("credential_email_leaked", () => probeProductionPostLive({
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

    await expectFailure("credential_password_leaked", () => probeProductionPostLive({
      browser: fakeBrowser({ responsePayload: passwordLeakPayload }).value,
      productionFqdn: FQDN,
      targetSha: SHA,
      email: leakedEmail,
      password: leakedPassword,
    }));
  });

  it("exports typed failure for callers", () => {
    const err = new ProductionPostLiveProbeFailure("code");
    expect(err.code).toBe("code");
  });
});
