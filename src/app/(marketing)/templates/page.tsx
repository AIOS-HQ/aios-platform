import type { Metadata } from "next";
import { COMPANY_TEMPLATES } from "@/lib/marketplace";
import { MarketingHero, Section, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = { title: "Company Templates" };

/**
 * Public showcase of Company Templates. Sourced from the pure template catalog
 * so it matches the real blueprints. CTAs route to sign-up (the authed Company
 * Builder at /harmony/build provisions the selected template after login).
 * TODO(codex): deep-link each card to /signup?template=<slug> and carry the
 * selection into the builder post-auth; add template hero imagery.
 */
export default function TemplatesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Company Templates"
        title="Deploy a complete company in one click"
        subtitle="Each template provisions a full autonomous company — departments, an AI workforce, objectives, and connector configuration — on the Universal Capability Runtime."
      >
        <CtaLink href="/signup">Deploy a company</CtaLink>
        <CtaLink href="/marketplace" variant="outline">Back to marketplace</CtaLink>
      </MarketingHero>

      <Section title={`${COMPANY_TEMPLATES.length} ready-to-deploy blueprints`} subtitle="Pick a starting point tuned to your industry, then customize the workforce and connectors.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMPANY_TEMPLATES.map((tpl) => (
            <div key={tpl.id} className="flex flex-col rounded-2xl border bg-card p-6 transition hover:border-primary/30 hover:shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold tracking-tight">{tpl.name}</h3>
                <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{tpl.industry}</span>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{tpl.summary}</p>
              <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-muted px-1.5 py-0.5">{tpl.workforce.length} AI workers</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5">{tpl.departments.length} departments</span>
                <span className="rounded-md bg-muted px-1.5 py-0.5">{tpl.connectors.length} connectors</span>
              </div>
              <div className="mt-5">
                <CtaLink href="/signup">Deploy {tpl.name}</CtaLink>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
