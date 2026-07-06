import type { Metadata } from "next";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "Docs · AIOS",
  description:
    "Read AIOS documentation topics for quickstart, company templates, the AI workforce, marketplace, connectors, autonomy, and approvals.",
};

/**
 * Docs placeholder. TODO(codex): replace with a real docs system (MDX or a docs
 * route tree). For now it routes visitors to the existing FAQ + Help Center and
 * previews planned topics. See docs/PUBLIC_WEBSITE.md.
 */
const PLANNED_TOPICS: { title: string; description: string }[] = [
  { title: "Quickstart", description: "Create an account, deploy your first company template, and meet Harmony." },
  { title: "Company Templates", description: "How templates provision a full company and how to customize them." },
  { title: "AI Workforce", description: "Who each specialist is, what they do, and how they collaborate through Harmony." },
  { title: "Marketplace", description: "Install workers, departments, skills, connectors, dashboards, and bundles." },
  { title: "Connectors", description: "Connect Google, Slack, GitHub, and more — and what each connector can do." },
  { title: "Autonomy & Approvals", description: "Configure what runs autonomously vs. what waits for your approval." },
];

export default function DocsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Documentation"
        title="Docs are on the way"
        subtitle="We're writing the guides. In the meantime, the FAQ and Help Center cover the essentials."
      >
        <CtaLink href="/faq">Read the FAQ</CtaLink>
        <CtaLink href="/help" variant="outline">Help Center</CtaLink>
      </MarketingHero>

      <Section title="Planned topics" subtitle="A preview of the documentation coming to this section.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED_TOPICS.map((topic) => (
            <Card key={topic.title} title={topic.title}>{topic.description}</Card>
          ))}
        </div>
      </Section>
    </>
  );
}
