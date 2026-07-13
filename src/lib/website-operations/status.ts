import "server-only";

import { env } from "@/lib/env";

export interface WebsiteRouteStatus {
  route: string;
  purpose: string;
  publicRoute: boolean;
  status: "complete" | "partial" | "configuration_required";
  cta: string;
  metadata: string;
}

export interface WebsiteOperationsSnapshot {
  generatedAt: string;
  siteUrl: string;
  analyticsConfigured: boolean;
  routes: WebsiteRouteStatus[];
  metrics: Array<{
    label: string;
    value: string;
    status: "pass" | "configuration_required" | "not_tracked";
    source: string;
  }>;
  founderActions: string[];
}

export const PUBLIC_WEBSITE_ROUTES: WebsiteRouteStatus[] = [
  {
    route: "/",
    purpose: "AIOS landing page and early-access conversion.",
    publicRoute: true,
    status: "complete",
    cta: "Waitlist, pricing, docs, login",
    metadata: "Page metadata plus Open Graph/X card.",
  },
  {
    route: "/features",
    purpose: "Product capability overview.",
    publicRoute: true,
    status: "complete",
    cta: "Get started, docs",
    metadata: "Static route metadata.",
  },
  {
    route: "/ai-workforce",
    purpose: "AIOS workforce overview with Julius as brain, not an agent.",
    publicRoute: true,
    status: "complete",
    cta: "Explore product, get started",
    metadata: "Static route metadata.",
  },
  {
    route: "/templates",
    purpose: "Company template catalogue.",
    publicRoute: true,
    status: "complete",
    cta: "Use template after signup",
    metadata: "Static route metadata.",
  },
  {
    route: "/marketplace",
    purpose: "Public marketplace categories.",
    publicRoute: true,
    status: "complete",
    cta: "Browse and sign up",
    metadata: "Static route metadata.",
  },
  {
    route: "/pricing",
    purpose: "Pricing and plan selection.",
    publicRoute: true,
    status: "complete",
    cta: "Start checkout/signup",
    metadata: "Static route metadata.",
  },
  {
    route: "/docs",
    purpose: "Public documentation index.",
    publicRoute: true,
    status: "complete",
    cta: "Learn product concepts",
    metadata: "Static route metadata.",
  },
  {
    route: "/faq",
    purpose: "Common public questions.",
    publicRoute: true,
    status: "complete",
    cta: "Get help or sign up",
    metadata: "Static route metadata.",
  },
  {
    route: "/help",
    purpose: "Public help center.",
    publicRoute: true,
    status: "complete",
    cta: "Support and docs",
    metadata: "Static route metadata.",
  },
  {
    route: "/privacy",
    purpose: "Privacy policy.",
    publicRoute: true,
    status: "complete",
    cta: "Legal review",
    metadata: "Static route metadata.",
  },
  {
    route: "/terms",
    purpose: "Terms of service.",
    publicRoute: true,
    status: "complete",
    cta: "Legal review",
    metadata: "Static route metadata.",
  },
];

export function getWebsiteOperationsSnapshot(): WebsiteOperationsSnapshot {
  const analyticsConfigured = Boolean(
    process.env.NEXT_PUBLIC_POSTHOG_KEY ||
      process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID ||
      process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  );

  return {
    generatedAt: new Date().toISOString(),
    siteUrl: env.siteUrl,
    analyticsConfigured,
    routes: PUBLIC_WEBSITE_ROUTES,
    metrics: [
      {
        label: "Visitors",
        value: analyticsConfigured ? "Provider configured" : "Configuration required",
        status: analyticsConfigured ? "pass" : "configuration_required",
        source: "Analytics provider",
      },
      {
        label: "Pricing CTA",
        value: "Not tracked",
        status: "not_tracked",
        source: "No persisted CTA event table",
      },
      {
        label: "Waitlist submissions",
        value: "Acknowledged, not persisted",
        status: "not_tracked",
        source: "/api/waitlist",
      },
      {
        label: "SEO indexability",
        value: "Public sitemap/robots configured",
        status: "pass",
        source: "sitemap.ts + robots.ts",
      },
    ],
    founderActions: [
      "Configure an analytics provider before displaying visitor counts, page views, or conversion rates.",
      "Persist waitlist/contact submissions through an approved CRM or email provider before reporting funnel conversion.",
      "Keep protected Harmony and settings routes out of public sitemap and public navigation.",
    ],
  };
}
