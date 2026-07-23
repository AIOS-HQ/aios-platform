import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  supabaseConfigured: true,
  cookiePresent: false,
  user: null as { id: string; email: string } | null,
  founder: false,
}));

vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: vi.fn(() => state.supabaseConfigured),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => state.cookiePresent
      ? [{ name: "sb-previewproject-auth-token", value: "never-return-cookie-value" }]
      : [],
  })),
}));

vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: vi.fn(async () => state.user),
}));

vi.mock("@/lib/auth/roles", () => ({
  currentUserIsAdmin: vi.fn(async () => state.founder),
}));

const originalEnvironment = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  NODE_ENV: process.env.NODE_ENV,
  AIOS_SESSION_DIAGNOSTIC_ENABLED: process.env.AIOS_SESSION_DIAGNOSTIC_ENABLED,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

async function diagnostic(url = "https://preview.example/api/admin/certification/session-diagnostic") {
  const { GET } = await import("@/app/api/admin/certification/session-diagnostic/route");
  return GET(new Request(url));
}

describe("Preview certification session diagnostic", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    process.env.NODE_ENV = originalEnvironment.NODE_ENV ?? "test";
    delete process.env.AIOS_SESSION_DIAGNOSTIC_ENABLED;
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example";
    state.supabaseConfigured = true;
    state.cookiePresent = false;
    state.user = null;
    state.founder = false;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("is available only in Preview by default and always disables caching", async () => {
    const preview = await diagnostic();
    expect(preview.status).toBe(200);
    expect(preview.headers.get("Cache-Control")).toBe("no-store");

    process.env.VERCEL_ENV = "production";
    const production = await diagnostic();
    expect(production.status).toBe(404);
    expect(production.headers.get("Cache-Control")).toBe("no-store");
    expect(await production.json()).toEqual({ ok: false, error: "not_found" });

    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    process.env.AIOS_SESSION_DIAGNOSTIC_ENABLED = "true";
    expect((await diagnostic()).status).toBe(200);
  });

  it("classifies missing Supabase configuration", async () => {
    state.supabaseConfigured = false;
    const body = await (await diagnostic()).json();
    expect(body.diagnostic).toMatchObject({
      supabaseConfigured: false,
      likelyFailureStage: "supabase_not_configured",
    });
  });

  it("classifies a missing plausible Supabase session cookie", async () => {
    const body = await (await diagnostic()).json();
    expect(body.diagnostic).toMatchObject({
      supabaseConfigured: true,
      supabaseCookiePresent: false,
      authenticatedUserResolved: false,
      founderAuthorizationResolved: false,
      likelyFailureStage: "session_cookie_missing",
    });
  });

  it("classifies a cookie that cannot resolve an authenticated user", async () => {
    state.cookiePresent = true;
    const body = await (await diagnostic()).json();
    expect(body.diagnostic).toMatchObject({
      supabaseCookiePresent: true,
      authenticatedUserResolved: false,
      likelyFailureStage: "authenticated_user_not_resolved_with_cookie_present",
      operatorHint: "verify_preview_supabase_project_key_and_account_alignment",
    });
  });

  it("classifies an authenticated non-Founder without returning identity data", async () => {
    state.cookiePresent = true;
    state.user = { id: "never-return-user-id", email: "never-return@example.com" };
    const body = await (await diagnostic()).json();
    expect(body.diagnostic).toMatchObject({
      authenticatedUserResolved: true,
      founderAuthorizationResolved: false,
      likelyFailureStage: "founder_authorization",
    });
    expect(JSON.stringify(body)).not.toContain("never-return-user-id");
    expect(JSON.stringify(body)).not.toContain("never-return@example.com");
  });

  it("reports a fully authenticated Founder with a matching origin", async () => {
    state.cookiePresent = true;
    state.user = { id: "founder-id", email: "founder@example.com" };
    state.founder = true;
    const response = await diagnostic();
    expect(await response.json()).toEqual({
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
      },
    });
  });

  it("reports origin mismatch and unknown states without returning either origin", async () => {
    state.cookiePresent = true;
    state.user = { id: "founder-id", email: "founder@example.com" };
    state.founder = true;
    process.env.NEXT_PUBLIC_SITE_URL = "https://different.example";
    const mismatch = await (await diagnostic()).json();
    expect(mismatch.diagnostic).toMatchObject({
      requestOriginMatchesConfiguredSiteOrigin: false,
      likelyFailureStage: "origin_mismatch",
    });

    delete process.env.NEXT_PUBLIC_SITE_URL;
    const unknown = await (await diagnostic()).json();
    expect(unknown.diagnostic).toMatchObject({
      requestOriginMatchesConfiguredSiteOrigin: "unknown",
      likelyFailureStage: "unknown",
    });
    const serialized = JSON.stringify([mismatch, unknown]);
    expect(serialized).not.toContain("different.example");
    expect(serialized).not.toContain("preview.example");
  });

  it("never returns cookie, credential, URL, key, identity, or environment values", async () => {
    state.cookiePresent = true;
    state.user = { id: "private-user-id", email: "private@example.com" };
    state.founder = true;
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://private-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "private-publishable-key";
    const body = await (await diagnostic()).json();
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "never-return-cookie-value",
      "sb-previewproject-auth-token",
      "private-user-id",
      "private@example.com",
      "private-project.supabase.co",
      "private-publishable-key",
      "https://preview.example",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
