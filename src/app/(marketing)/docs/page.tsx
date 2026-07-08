import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "Docs · AIOS",
  description:
    "Read AIOS documentation topics for quickstart, company templates, the AI workforce, marketplace, connectors, autonomy, and approvals.",
};

const DOC_TOPICS: { title: string; description: string; href: string }[] = [
  { title: "Getting Started", description: "Create an account, understand the Vercel Founder Beta endpoint, and open Harmony.", href: "/help" },
  { title: "Founder Beta", description: "What to verify before daily use: production env, Supabase, auth, and smoke tests.", href: "/faq" },
  { title: "Harmony", description: "How the AI Chief of Staff coordinates tasks, goals, memory, approvals, and work.", href: "/features" },
  { title: "Julius", description: "How organizational memory supports objectives, decisions, activity, and knowledge.", href: "/ai-workforce" },
  { title: "Marketplace", description: "How workers, templates, skills, workflows, connectors, dashboards, and bundles fit together.", href: "/marketplace" },
  { title: "AI Workforce", description: "How named AI specialists collaborate through Harmony and shared context.", href: "/ai-workforce" },
  { title: "Integrations", description: "How connector configuration and provider credentials unlock live tool access.", href: "/help" },
  { title: "Deployment", description: "How Founder Beta uses the current Vercel production endpoint until a domain is approved.", href: "/help" },
  { title: "Security", description: "Human approval, owner-scoped data, token encryption, CSP, and admin boundaries.", href: "/privacy" },
  { title: "FAQ / Help", description: "Practical answers and support paths for early users.", href: "/faq" },
];

export default function DocsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Documentation"
        title="AIOS documentation hub"
        subtitle="Start with the core operating concepts behind Founder Beta, Harmony, Julius, the AI workforce, marketplace, company templates, integrations, deployment, security, and support."
      >
        <CtaLink href="/faq">Read the FAQ</CtaLink>
        <CtaLink href="/help" variant="outline">Open Help Center</CtaLink>
      </MarketingHero>

      <Section
        title="Documentation map"
        subtitle="A structured guide to the public AIOS launch surface. Operational diagnostics and sensitive technical references stay inside the authenticated workspace."
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DOC_TOPICS.map((topic) => (
            <Card key={topic.title} title={topic.title}>
              <p>{topic.description}</p>
              <Link href={topic.href} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
                Open related page
              </Link>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
