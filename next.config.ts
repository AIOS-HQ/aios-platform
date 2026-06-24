import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads its per-request config (locale + messages) from this file.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// A Content-Security-Policy in REPORT-ONLY mode. This does NOT block anything —
// browsers only report violations (to the console, and to a collector once one
// is wired up). It is the safe first step toward an enforced CSP: observe real
// violations against the app's inline theme script + Next.js runtime, tighten
// the policy (move to nonces, drop 'unsafe-inline'/'unsafe-eval'), then rename
// the header to "Content-Security-Policy" to enforce. Shipping it report-only
// keeps the app's behaviour identical while we gather data.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https:",
  "form-action 'self' https:",
].join("; ");

// Baseline security headers applied to every response. These are safe defaults
// that do not affect app behaviour. CSP is shipped in report-only mode (above)
// so it observes without blocking until the policy is validated and enforced.
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep build output lean and predictable.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
