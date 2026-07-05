import type { Metadata } from "next";
import { AIOS_WORKFORCE, isFounderOnlyAgent, JULIUS } from "@/lib/workforce/registry";
import { MarketingHero, Section, Card, CtaLink } from "@/components/marketing/sections";

export const metadata: Metadata = { title: "AI Workforce" };

/**
 * Public showcase of the AIOS workforce. Sourced from the workforce registry
 * (pure, client-safe) so it always matches the real roster. Founder-only agents
 * are never shown. TODO(codex): add per-worker portraits + link to a public
 * per-worker profile once those exist.
 */
export default function AiWorkforcePage() {
  const workers = AIOS_WORKFORCE.filter((a) => !isFounderOnlyAgent(a.key));
  return (
    <>
      <MarketingHero
        eyebrow="AI Workforce"
        title="A named team of AI specialists"
        subtitle="You work with Harmony, your AI Chief of Staff. Behind the scenes, a coordinated workforce handles strategy, growth, finance, security, knowledge, and operations — sharing one organizational brain."
      >
        <CtaLink href="/signup">Hire your workforce</CtaLink>
        <CtaLink href="/features" variant="outline">How it works</CtaLink>
      </MarketingHero>

      <Section title="Meet the workforce" subtitle="Every specialist collaborates through Harmony and learns from your company's shared memory.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((a) => (
            <Card key={a.key} title={`${a.name} — ${a.role}`}>{a.purpose}</Card>
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
            <CtaLink href="/signup">Get started</CtaLink>
            <CtaLink href="/templates" variant="outline">Deploy a company</CtaLink>
          </div>
        </div>
      </Section>
    </>
  );
}
