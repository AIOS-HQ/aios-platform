import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads its per-request config (locale + messages) from this file.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Baseline security headers applied to every response. These are safe static
// defaults that do not affect app behaviour.
//
// NOTE: Content-Security-Policy is intentionally NOT set here. It is emitted
// per-request by middleware (src/middleware.ts → src/lib/security/csp.ts) so it
// can carry a fresh script nonce. Setting a second, static CSP here would have
// the browser enforce BOTH policies and conflict with the nonce policy. Mode is
// controlled by the CSP_MODE env var (report-only by default).
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
