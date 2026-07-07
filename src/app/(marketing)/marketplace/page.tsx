import type { Metadata } from "next";
import { MARKETPLACE_CATEGORIES } from "@/lib/marketplace";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "Marketplace · AIOS",
  description:
    "Explore the AIOS Marketplace for AI workers, departments, skills, connectors, dashboards, bundles, and company templates.",
};

/**
 * Public, marketing-facing view of the AIOS Marketplace. The live, installable
 * storefront lives in the app at /harmony/marketplace (auth-gated). This page
 * showcases the categories and routes visitors to sign up.
 * TODO(codex): pull featured/verified items via a public read + add imagery.
 */
export default function MarketplacePage() {
  return (
    <>
      <MarketingHero
        eyebrow="Marketplace"
        title="Install a capability. Or an entire company."
        subtitle="AI workers, departments, skills, connectors, dashboards, and full company templates — versioned, verified, rated, and rollback-safe on one Universal Capability Runtime."
      >
        <CtaLink href="/signup">Start free</CtaLink>
        <CtaLink href="/login" variant="outline">Open the marketplace</CtaLink>
      </MarketingHero>

      <Section title="Twelve storefront categories" subtitle="Every category shares one engine — versioning, verification, ratings, dependencies, install/update/rollback — so everything works the same way.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETPLACE_CATEGORIES.map((c) => (
            <Card key={c.slug} title={c.label}>{c.description}</Card>
          ))}
        </div>
      </Section>

      <Section title="One-click business functions" subtitle="Deploy a full department or company — the workforce, connectors, and dashboards come preconfigured.">
        <div className="flex flex-wrap gap-3">
          <CtaLink href="/templates">See company templates</CtaLink>
          <CtaLink href="/signup" variant="outline">Get started</CtaLink>
        </div>
      </Section>
    </>
  );
}
