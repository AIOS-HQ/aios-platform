import "server-only";

import { isProductionRuntime } from "@/lib/env";

/**
 * Content-Security-Policy helpers (the "nonces → enforce" half of the
 * collector → nonces → enforce rollout).
 *
 * The policy is generated PER REQUEST in middleware so each response carries a
 * fresh script nonce. Mode is env-driven and defaults to report-only — the safe
 * middle of the rollout: the browser reports violations to the in-app collector
 * (`/api/csp-report`) but blocks nothing until the founder sets
 * `CSP_MODE=enforce`. `CSP_MODE=off` disables CSP entirely (escape hatch).
 */

export type CspMode = "off" | "report-only" | "enforce";

/** Resolve the rollout mode from `CSP_MODE`.
 *
 * Production defaults to enforce unless explicitly set; development and Vercel
 * previews default to report-only so CSP rollout can be debugged without
 * blocking local work.
 */
export function cspMode(): CspMode {
  const fallback = isProductionRuntime() ? "enforce" : "report-only";
  const v = (process.env.CSP_MODE ?? fallback).toLowerCase();
  if (v === "off" || v === "enforce") return v;
  return "report-only";
}

/** Fresh base64 nonce. Edge-safe — Web Crypto + btoa only (no Buffer). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Build the CSP string for a given nonce.
 *
 * - `script-src`: `'nonce-…' 'strict-dynamic'` (NO `'unsafe-inline'` /
 *   `'unsafe-eval'`). `strict-dynamic` lets nonce'd scripts load the chunks
 *   they pull in (how Next.js's loader works); `https:` is a fallback for
 *   browsers that ignore `strict-dynamic`.
 * - `style-src`: keeps `'unsafe-inline'` — Tailwind/inline styles can't be
 *   nonce'd practically, and style injection is a far lower risk than script.
 * - `report-uri` + `report-to` send violations to the in-app collector.
 */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "connect-src 'self' https:",
    "form-action 'self' https:",
    "report-uri /api/csp-report",
    "report-to csp",
  ].join("; ");
}

/** Response header name for the active mode, or null when CSP is off. */
export function cspHeaderName(mode: CspMode): string | null {
  if (mode === "off") return null;
  return mode === "enforce"
    ? "Content-Security-Policy"
    : "Content-Security-Policy-Report-Only";
}

/** `Reporting-Endpoints` value naming the `csp` group used by `report-to`. */
export const CSP_REPORTING_ENDPOINTS = 'csp="/api/csp-report"';
