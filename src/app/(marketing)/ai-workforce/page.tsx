import type { Metadata } from "next";
import { AIOS_WORKFORCE, isFounderOnlyAgent, JULIUS } from "@/lib/workforce/registry";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = {
  title: "AI Workforce · AIOS",
  description:
    "Meet the AIOS workforce coordinated by Harmony, including AI specialists for strategy, growth, finance, security, knowledge, and operations.",
};

const WORKFORCE_FLOW = [
  { title: "Harmony receives the request", description: "The founder talks to one AI Chief of Staff instead of managing a set of disconnected bots." },
  { title: "Specialists coordinate", description: "The workforce routes work through domain-specific specialists with shared context and review points." },
  { title: "Julius preserves memory", description: "Decisions, objectives, activities, and knowledge become organizational memory for future work." },
];

export default function AiWorkforcePage() {
  const workers = AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key));
  return (
    <>
      <MarketingHero
        eyebrow="AI Workforce"
        title="One chief of staff. A coordinated AI workforce."
        subtitle="Harmony is the front door. Behind it, the AIOS workforce handles specialized work across engineering, growth, communications, knowledge, security, records, strategy, and monitoring."
      >
        <CtaLink href="/signup">Join Founder Beta</CtaLink>
        <CtaLink href="/features" variant="outline">How it works</CtaLink>
      </MarketingHero>

      <Section title="Meet the current AIOS workforce" subtitle="This roster is sourced from the real AIOS workforce registry, excluding founder-only engineering agents from the public showcase.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((a) => (
            <Card key={a.key} title={`${a.name} — ${a.role}`}>{a.purpose}</Card>
          ))}
        </div>
      </Section>

      <Section title="How the workforce works" subtitle="AIOS presents a coordinated operating model instead of a loose collection of assistants.">
        <div className="grid gap-5 md:grid-cols-3">
          {WORKFORCE_FLOW.map((item) => (
            <Card key={item.title} title={item.title}>{item.description}</Card>
          ))}
        </div>
      </Section>

      <Section title={`${JULIUS.name} — the organizational brain`} subtitle="Not an agent, but the shared memory the whole workforce reads from and writes to.">
        <div className="rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            {JULIUS.name} holds your company&apos;s {JULIUS.responsibilities.slice(0, 6).join(", ")}, and more — so the
            workforce stays mutually aware and gets smarter with every outcome.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <CtaLink href="/signup">Create your account</CtaLink>
            <CtaLink href="/templates" variant="outline">Deploy a company</CtaLink>
          </div>
        </div>
      </Section>
    </>
  );
}
