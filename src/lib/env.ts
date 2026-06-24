/**
 * Centralized environment access.
 *
 * Keeps env var names in one place and provides typed getters. Clients are
 * constructed lazily (inside functions, never at module scope) so a missing
 * value never breaks the build — only runtime calls that actually need it.
 *
 * NOTE: this module is imported by client code (the Supabase browser client
 * reads `env.supabaseUrl` / `env.supabaseAnonKey`), so it must stay
 * client-safe — do NOT add `import "server-only"` here, and only reference
 * NEXT_PUBLIC_* vars for values that reach the browser.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Supabase's newer dashboards label this the "publishable" key (and Vercel is
  // configured with NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); older ones call it
  // "anon". Accept both names. Both literals are referenced directly so Next
  // inlines whichever is defined into the client bundle at build time.
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  aiProvider: (process.env.AI_PROVIDER ?? "openai").toLowerCase(),
} as const;

/** True when the Supabase public env vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/**
 * True ONLY in real production — Vercel's production environment, or a
 * non-Vercel host running with NODE_ENV=production. Vercel "preview" and local
 * "development" are intentionally excluded so fail-closed security checks never
 * break preview testing or local development.
 *
 * Call this at REQUEST time, not at module top-level: `next build` runs with
 * NODE_ENV=production but without runtime secrets, so top-level fail-closed
 * logic gated on this could fail the build.
 */
export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}
