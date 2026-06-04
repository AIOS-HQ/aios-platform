/**
 * Centralized environment access.
 *
 * Keeps env var names in one place and provides typed getters. Clients are
 * constructed lazily (inside functions, never at module scope) so a missing
 * value never breaks the build — only runtime calls that actually need it.
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
  aiProvider: (process.env.AI_PROVIDER ?? "mock").toLowerCase(),
} as const;

/** True when the Supabase public env vars are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}
