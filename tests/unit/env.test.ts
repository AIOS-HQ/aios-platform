import { describe, it, expect, beforeEach, afterAll } from "vitest";

/**
 * `src/lib/env.ts` reads process.env at module-evaluation time, so each case
 * sets the environment, resets the module registry, and dynamically imports a
 * fresh copy. Env vars are saved/restored to keep the suite isolated.
 */

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
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
