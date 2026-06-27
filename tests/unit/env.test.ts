import { describe, it, expect, beforeEach, afterAll } from "vitest";

/**
 * `src/lib/env.ts` reads process.env at module-evaluation time, so each case
 * sets the environment, resets the module registry, and dynamically imports a
 * fresh copy. Env vars are saved/restored to keep the suite isolated.
 */

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AIOS_ADMIN_EMAILS",
  "TOKEN_ENCRYPTION_KEY",
  "CSP_MODE",
  "VERCEL_ENV",
  "NODE_ENV",
] as const;

const original: Record<string, string | undefined> = {};
for (const k of KEYS) original[k] = process.env[k];

beforeEach(async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
  for (const k of KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("env key resolution", () => {
  it("prefers the publishable key over the anon key", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub-key";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { env } = await import("@/lib/env");
    expect(env.supabaseAnonKey).toBe("pub-key");
  });

  it("falls back to the anon key when the publishable key is absent", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { env } = await import("@/lib/env");
    expect(env.supabaseAnonKey).toBe("anon-key");
  });

  it("isSupabaseConfigured is false when url or key is missing", async () => {
    const { isSupabaseConfigured } = await import("@/lib/env");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("isSupabaseConfigured is true when url and a key are present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub-key";
    const { isSupabaseConfigured } = await import("@/lib/env");
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("server production env validation", () => {
  it("reports production-critical env vars without secret values", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    const { getMissingProductionEnv } = await import("@/lib/env.server");

    expect(getMissingProductionEnv()).toEqual([
      "AIOS_ADMIN_EMAILS",
      "TOKEN_ENCRYPTION_KEY",
    ]);
  });

  it("fails loudly only in production runtime", async () => {
    process.env.VERCEL_ENV = "production";
    const { assertProductionEnv } = await import("@/lib/env.server");

    expect(() => assertProductionEnv()).toThrow(
      "Missing production-critical environment variable",
    );
  });
});

describe("CSP mode defaults", () => {
  it("defaults to report-only outside production", async () => {
    const { cspMode } = await import("@/lib/security/csp");
    expect(cspMode()).toBe("report-only");
  });

  it("defaults to enforce in production runtime", async () => {
    process.env.VERCEL_ENV = "production";
    const { cspMode } = await import("@/lib/security/csp");
    expect(cspMode()).toBe("enforce");
  });

  it("respects explicit report-only mode in production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.CSP_MODE = "report-only";
    const { cspMode } = await import("@/lib/security/csp");
    expect(cspMode()).toBe("report-only");
  });
});
