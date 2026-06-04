import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads its per-request config (locale + messages) from this file.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep build output lean and predictable.
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
