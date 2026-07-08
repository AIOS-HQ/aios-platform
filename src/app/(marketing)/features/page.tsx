import type { Metadata } from "next";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "Features · AIOS",
  description:
    "Explore AIOS features for Harmony, the AI workforce, company templates, marketplace capabilities, approvals, and portable company operations.",
};

const FEATURE_GROUPS: { title: string; description: string; features: { title: string; description: string }[] }[] = [
  {
    title: "Operate",
    description: "The command surfaces a founder uses every day.",
    features: [
      { title: "Harmony", description: "A single AI Chief of Staff for goals, tasks, approvals, memory, and workforce coordination." },
      { title: "Founder Command Center", description: "Executive visibility into companies, objectives, approvals, activity, recommendations, and launch signals." },
      { title: "Julius", description: "The organizational brain: company memory, decisions, objectives, activity, and knowledge that agents can read and write." },
    ],
  },
  {
    title: "Build",
    description: "The systems that turn a business idea into an operating company.",
    features: [
      { title: "Company Builder", description: "Template-driven company creation with departments, objectives, workforce activation, and connector planning." },
      { title: "Company Templates", description: "Launch-ready blueprints for repeatable company setup, tuned by industry and operating model." },
      { title: "Portable Company", description: "Company context, brain, skills, and configuration are treated as assets that can be backed up and evolved." },
    ],
  },
  {
    title: "Extend",
    description: "Capabilities that compound as the company grows.",
    features: [
      { title: "AI Workforce", description: "Named specialists for engineering, growth, communications, knowledge, security, records, strategy, and monitoring." },
      { title: "Marketplace", description: "Workers, templates, skills, workflows, connectors, dashboards, and bundles on one verified capability runtime." },
      { title: "Integrations", description: "Connector status, OAuth setup, token security, and health checks are surfaced from the Integration Center." },
    ],
  },
  {
    title: "Govern",
    description: "Controls designed for trust before automation.",
    features: [
      { title: "Approvals", description: "High-impact actions route through founder review before execution." },
      { title: "Security", description: "Owner-scoped data access, token encryption, production env checks, CSP, and admin boundaries are built in." },
      { title: "Autonomy Controls", description: "Autonomy levels, risk categories, kill switches, and audit trails keep humans in control." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Features"
        title="The operating system for an autonomous company"
        subtitle="AIOS combines Harmony, Julius, a named AI workforce, company templates, marketplace capabilities, integrations, and founder-grade controls into one coherent platform."
      >
        <CtaLink href="/signup">Join Founder Beta</CtaLink>
        <CtaLink href="/marketplace" variant="outline">Explore the marketplace</CtaLink>
      </MarketingHero>

      {FEATURE_GROUPS.map((group) => (
        <Section key={group.title} title={group.title} subtitle={group.description}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.features.map((f) => (
              <Card key={f.title} title={f.title}>{f.description}</Card>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Ready to see the system?" subtitle="Start from a company template, then use Harmony as the front door into the operating system.">
        <div className="flex flex-wrap gap-3">
          <CtaLink href="/signup">Create your account</CtaLink>
          <CtaLink href="/templates" variant="outline">Browse company templates</CtaLink>
        </div>
      </Section>
    </>
  );
}
