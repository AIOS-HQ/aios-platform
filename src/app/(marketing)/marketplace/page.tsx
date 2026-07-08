import type { Metadata } from "next";
import { MARKETPLACE_CATEGORIES } from "@/lib/marketplace";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "Marketplace · AIOS",
  description:
    "Explore the AIOS Marketplace for AI workers, departments, skills, connectors, dashboards, bundles, and company templates.",
};

const MARKETPLACE_PRINCIPLES = [
  { title: "Verified capability catalog", description: "Public marketplace items are expected to be versioned, reviewed, and safe to install before they appear in the authenticated app." },
  { title: "One runtime", description: "Workers, departments, skills, workflows, connectors, dashboards, and templates share the same install and rollback model." },
  { title: "No public purchasing", description: "The public website explains the catalog. Billing, checkout, and entitlements remain outside this launch surface." },
];

export default function MarketplacePage() {
  return (
    <>
      <MarketingHero
        eyebrow="Marketplace"
        title="Install a capability. Or deploy an operating model."
        subtitle="The AIOS Marketplace organizes AI workers, company templates, skills, workflows, connectors, dashboards, and bundles around one capability runtime."
      >
        <CtaLink href="/signup">Join Founder Beta</CtaLink>
        <CtaLink href="/login" variant="outline">Open the marketplace</CtaLink>
      </MarketingHero>

      <Section title="Marketplace categories" subtitle="The public catalog mirrors the existing AIOS marketplace model without adding purchases or fake listings.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETPLACE_CATEGORIES.map((c) => (
            <Card key={c.slug} title={c.label}>{c.description}</Card>
          ))}
        </div>
      </Section>

      <Section title="How marketplace capabilities behave" subtitle="The marketplace is designed as a governed capability layer, not a storefront checkout flow.">
        <div className="grid gap-5 md:grid-cols-3">
          {MARKETPLACE_PRINCIPLES.map((item) => (
            <Card key={item.title} title={item.title}>{item.description}</Card>
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
