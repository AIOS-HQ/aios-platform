import "server-only";

/**
 * Runtime environment helpers (server-only).
 *
 * `isProductionRuntime()` is true ONLY in real production — Vercel's production
 * environment, or a non-Vercel host running with NODE_ENV=production. Vercel
 * "preview" and local "development" are intentionally excluded so fail-closed
 * security checks never break preview testing or local development.
 *
 * IMPORTANT: these read process.env and are meant to be called at REQUEST time.
 * Do NOT invoke them at module top-level in a way that could throw during
 * `next build` (the build runs with NODE_ENV=production but without runtime
 * secrets), or you risk failing the build.
 */
export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}
