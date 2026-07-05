import type { Metadata } from "next";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = { title: "Features" };

// TODO(codex): move copy into a `website` i18n namespace; add screenshots per feature.
const FEATURES: { title: string; description: string }[] = [
  { title: "Harmony — AI Chief of Staff", description: "One intelligence you talk to. Harmony understands the goal, coordinates a workforce of AI specialists, and delivers the result." },
  { title: "AI Workforce", description: "A named team of AI specialists — strategy, growth, finance, security, knowledge, and more — that collaborate on your company's work." },
  { title: "Julius — Organizational Brain", description: "The shared memory of your company: objectives, decisions, documents, activity, and the relationships between everything." },
  { title: "Universal Marketplace", description: "Install AI workers, departments, skills, connectors, dashboards — or deploy an entire autonomous company — all versioned, verified, and rollback-safe." },
  { title: "Company Templates", description: "Blueprints that provision a complete autonomous company — workforce, departments, objectives, and connector config — in one deploy." },
  { title: "Autonomous Provisioning", description: "Turn a template into a configured company on the Universal Capability Runtime, specialized per company via the Company Context Envelope." },
  { title: "Portable Company", description: "A company is its Context Envelope + brain + skills — export, back up, clone, and redeploy it. You own your data." },
  { title: "Ledger — AI CFO", description: "Financial context, records, and reporting that keep the operating picture honest and investor-ready." },
  { title: "Digital Twin", description: "A living model of your operation for insight today and simulation, forecasting, and scenario planning ahead." },
  { title: "Connector Operating System", description: "One universal OAuth engine and capability runtime — every connector is one environment variable away from production." },
  { title: "Autonomy & Approvals", description: "Human in control by default: routine actions run autonomously, risky ones wait for your approval. Trust before automation." },
  { title: "Multi-Company", description: "Run several autonomous companies from one operating system, each with its own workforce, context, and dashboards." },
];

export default function FeaturesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Features"
        title="One AI Chief of Staff. A whole company behind it."
        subtitle="AIOS provisions complete autonomous companies — Harmony, Julius, Ledger, and an AI workforce — on one Universal Capability Runtime, specialized to your business."
      >
        <CtaLink href="/signup">Get started</CtaLink>
        <CtaLink href="/marketplace" variant="outline">Explore the marketplace</CtaLink>
      </MarketingHero>

      <Section title="Everything, coordinated" subtitle="The building blocks of an autonomous company — designed to work together from day one.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} title={f.title}>{f.description}</Card>
          ))}
        </div>
      </Section>

      <Section title="Ready to see it run?" subtitle="Deploy a company template and watch the workforce come alive.">
        <div className="flex flex-wrap gap-3">
          <CtaLink href="/signup">Create your company</CtaLink>
          <CtaLink href="/templates" variant="outline">Browse company templates</CtaLink>
        </div>
      </Section>
    </>
  );
}
