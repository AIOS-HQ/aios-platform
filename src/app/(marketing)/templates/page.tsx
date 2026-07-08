import type { Metadata } from "next";
import { COMPANY_TEMPLATES } from "@/lib/marketplace";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "Company Templates · AIOS",
  description:
    "Browse AIOS company templates that provision workforce, departments, objectives, and connector configuration for launch-ready operations.",
};

const TEMPLATE_STEPS = [
  { title: "Choose a blueprint", description: "Start from an existing company template rather than a blank workspace." },
  { title: "Customize the operating model", description: "Adjust company name, departments, connectors, and autonomy level in the Company Builder." },
  { title: "Deploy into AIOS", description: "The authenticated app creates the company, activates the workforce, and seeds operating context." },
];

export default function TemplatesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Company Templates"
        title="Start with a company blueprint"
        subtitle="AIOS company templates turn a business model into a configured workspace with departments, objectives, workforce activation, and connector planning."
      >
        <CtaLink href="/signup">Join Founder Beta</CtaLink>
        <CtaLink href="/marketplace" variant="outline">Back to marketplace</CtaLink>
      </MarketingHero>

      <Section title="How template deployment works" subtitle="Templates stay aligned with the existing Company Builder and authenticated deployment flow.">
        <div className="grid gap-5 md:grid-cols-3">
          {TEMPLATE_STEPS.map((step) => (
            <Card key={step.title} title={step.title}>{step.description}</Card>
          ))}
        </div>
      </Section>

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
                <CtaLink href="/signup">Start from this template</CtaLink>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
