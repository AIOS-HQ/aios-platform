import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Brain,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cog,
  FileText,
  Gauge,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { HarmonyLogo, HarmonyMark } from "@/components/brand/harmony-logo";
import { SiteHeader } from "@/components/marketing/site-header";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { Button } from "@/components/ui/button";
import {
  AUDIENCES,
  AUTOMATION,
  COMMAND_CENTER,
  EARLY_ACCESS,
  FAQS,
  FINAL_CTA,
  FOOTER,
  HERO,
  HUBS,
  INTEGRATIONS,
  PROBLEM,
  SITE,
  WHY,
} from "@/components/marketing/content";

export const metadata: Metadata = {
  title: {
    absolute: "Harmony — The Autonomous Operating System for Life and Business",
  },
  description: SITE.description,
  keywords: [
    "Harmony",
    "AIOS",
    "autonomous operating system",
    "AI assistant",
    "AI for business",
    "personal productivity",
    "AI automation",
    "AI chief of staff",
  ],
  openGraph: {
    title: "Harmony — The Autonomous Operating System for Life and Business",
    description: SITE.description,
    siteName: "Harmony",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Harmony — The Autonomous Operating System",
    description: SITE.valueProp,
  },
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Brain,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Cog,
  FileText,
  Gauge,
  GitBranch,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
  Zap,
};

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name] ?? Sparkles;
  return <Cmp className={className} />;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
      <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
      {children}
    </span>
  );
}

function IconTile({ name }: { name: string }) {
  return (
    <span className="inline-flex size-11 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary">
      <Icon name={name} className="size-5" />
    </span>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="group flex h-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-primary/40 hover:bg-white/[0.05]">
      <IconTile name={icon} />
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function HubVisualCard({
  icon,
  name,
  items,
}: {
  icon: string;
  name: string;
  items: string[];
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon name={icon} className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <span
              key={it}
              className="truncate rounded-md bg-white/5 px-2 py-1 text-xs text-muted-foreground"
            >
              {it}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="harmony-marketing relative min-h-dvh bg-background text-foreground">
      <SiteHeader />

      <main id="main-content">
        {/* ───────────────────────── Hero ───────────────────────── */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 harmony-grid opacity-[0.35]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-28 lg:px-8">
            <div className="flex flex-col items-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-foreground/90 backdrop-blur">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                {HERO.badge}
              </span>

              <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Run your life. Run your business.{" "}
                <span className="bg-linear-to-r from-[#8fd0ff] to-[#2f6bff] bg-clip-text text-transparent">
                  Harmony handles the work.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                {HERO.subtitle}
              </p>

              <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-12 px-7 text-base">
                  <a href="#waitlist">
                    {HERO.primaryCta}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/20 bg-transparent px-7 text-base text-foreground hover:bg-white/5"
                >
                  <a href="#why">{HERO.secondaryCta}</a>
                </Button>
              </div>

              <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                {HERO.proof}
              </p>

              <dl className="mt-10 grid w-full max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {HERO.stats.map((s) => (
                  <div key={s.label} className="flex flex-col">
                    <dt className="order-2 text-xs text-muted-foreground">
                      {s.label}
                    </dt>
                    <dd className="order-1 text-2xl font-bold tracking-tight text-foreground">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Hero visual: unified hubs snapshot */}
            <div className="relative lg:pl-6">
              <div
                className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-primary/10 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                    </span>
                    Harmony OS
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-muted-foreground">
                    Live
                  </span>
                </div>

                <div className="my-6 flex flex-col items-center justify-center gap-3 py-2">
                  <div className="relative">
                    <div
                      className="pointer-events-none absolute -inset-5 rounded-full bg-primary/25 blur-2xl"
                      aria-hidden="true"
                    />
                    <HarmonyMark className="relative size-20" title="Harmony" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    One intelligence, coordinating everything
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <HubVisualCard
                    icon="Sparkles"
                    name="Personal Hub"
                    items={["Plan my day", "Goal: launch Q3"]}
                  />
                  <HubVisualCard
                    icon="Building2"
                    name="Business Hub"
                    items={["3 approvals", "Ops on track"]}
                  />
                  <HubVisualCard
                    icon="Brain"
                    name="Harmony Hub"
                    items={["8 helpers active", "Orchestrating"]}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Audience strip */}
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Built for the people who run a lot
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                {AUDIENCES.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-foreground/90"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Problem ─────────────────────── */}
        <section className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>{PROBLEM.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {PROBLEM.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                {PROBLEM.subtitle}
              </p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROBLEM.pains.map((p) => (
                <FeatureCard key={p.title} icon={p.icon} title={p.title} body={p.body} />
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────── Why Harmony ─────────────────────── */}
        <section id="why" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>{WHY.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {WHY.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                {WHY.subtitle}
              </p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {WHY.pillars.map((p) => (
                <FeatureCard key={p.title} icon={p.icon} title={p.title} body={p.body} />
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────── Hubs ─────────────────────── */}
        {HUBS.map((hub, i) => (
          <section
            key={hub.id}
            id={hub.id}
            className={
              "scroll-mt-24 border-t border-white/[0.06]" +
              (i % 2 === 1 ? " bg-white/[0.015]" : "")
            }
          >
            <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
              <div className="max-w-3xl">
                <Eyebrow>{hub.eyebrow}</Eyebrow>
                <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                  {hub.title}
                </h2>
                <p className="mt-4 text-pretty text-lg text-muted-foreground">
                  {hub.subtitle}
                </p>
              </div>
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {hub.features.map((f) => (
                  <FeatureCard key={f.title} icon={f.icon} title={f.title} body={f.body} />
                ))}
              </div>
            </div>
          </section>
        ))}

        {/* ─────────────────── AI Helpers & Automation ─────────────────── */}
        <section id="automation" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>{AUTOMATION.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {AUTOMATION.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                {AUTOMATION.subtitle}
              </p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {AUTOMATION.helpers.map((h) => (
                <FeatureCard key={h.title} icon={h.icon} title={h.title} body={h.body} />
              ))}
            </div>

            <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
              <div className="max-w-2xl">
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {AUTOMATION.ladder.title}
                </h3>
                <p className="mt-3 text-muted-foreground">{AUTOMATION.ladder.body}</p>
              </div>
              <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {AUTOMATION.ladder.steps.map((s, idx) => (
                  <li key={s.step} className="relative flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
                        {s.step}
                      </span>
                      {idx < AUTOMATION.ladder.steps.length - 1 && (
                        <span className="hidden h-px flex-1 bg-linear-to-r from-primary/40 to-transparent lg:block" />
                      )}
                    </div>
                    <p className="text-base font-semibold text-foreground">{s.title}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Integrations ─────────────────────── */}
        <section id="integrations" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>{INTEGRATIONS.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {INTEGRATIONS.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                {INTEGRATIONS.subtitle}
              </p>
            </div>
            <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INTEGRATIONS.items.map((it) => (
                <div
                  key={it.name}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
                >
                  <span className="inline-flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-foreground">
                    {it.initials}
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{it.name}</p>
                    <p className="text-sm text-muted-foreground">{it.note}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              {INTEGRATIONS.footnote}
            </p>
          </div>
        </section>

        {/* ─────────────────── Founder Command Center ─────────────────── */}
        <section id="command-center" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
            <div>
              <Eyebrow>{COMMAND_CENTER.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {COMMAND_CENTER.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                {COMMAND_CENTER.subtitle}
              </p>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {COMMAND_CENTER.features.map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={f.icon} className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{f.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {f.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Command center panel mock */}
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-primary/10 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1020]/80 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Gauge className="size-4 text-primary" aria-hidden="true" />
                    {COMMAND_CENTER.panel.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    {COMMAND_CENTER.panel.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-white/10">
                  {COMMAND_CENTER.panel.rows.map((r) => (
                    <div key={r.label} className="bg-[#0a1020] p-4">
                      <p className="text-xs text-muted-foreground">{r.label}</p>
                      <p
                        className={
                          "mt-1 text-2xl font-bold tracking-tight " +
                          (r.tone === "warn" ? "text-amber-300" : "text-foreground")
                        }
                      >
                        {r.value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-3 px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent activity
                  </p>
                  {COMMAND_CENTER.panel.activity.map((a) => (
                    <div key={a} className="flex items-start gap-2.5 text-sm text-foreground/90">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="leading-snug">{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────── FAQ Preview ─────────────────────── */}
        <section id="faq" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="text-center">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Questions, answered
              </h2>
            </div>
            <div className="mt-12 flex flex-col gap-3">
              {FAQS.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] px-5 [&>summary]:list-none"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-left text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown
                      className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-5 text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────── Early Access ─────────────────────── */}
        <section id="early-access" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="overflow-hidden rounded-3xl border border-primary/20 bg-linear-to-br from-primary/[0.12] to-transparent p-8 sm:p-12">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                <div>
                  <Eyebrow>{EARLY_ACCESS.eyebrow}</Eyebrow>
                  <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                    {EARLY_ACCESS.title}
                  </h2>
                  <p className="mt-4 text-pretty text-lg text-muted-foreground">
                    {EARLY_ACCESS.subtitle}
                  </p>
                  <Button asChild size="lg" className="mt-8 h-12 px-7 text-base">
                    <a href="#waitlist">
                      Claim founding access
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
                <ul className="grid gap-4">
                  {EARLY_ACCESS.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-foreground/90">{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Waitlist ─────────────────────── */}
        <section id="waitlist" className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
            <Eyebrow>{WAITLIST.eyebrow}</Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {WAITLIST.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              {WAITLIST.subtitle}
            </p>
            <div className="mx-auto mt-8 max-w-lg">
              <WaitlistForm source="waitlist" />
              <p className="mt-3 text-xs text-muted-foreground">{WAITLIST.disclaimer}</p>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Final CTA ─────────────────────── */}
        <section className="relative overflow-hidden border-t border-white/[0.06]">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[150px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8 lg:py-32">
            <HarmonyMark className="mx-auto size-12" title="Harmony" />
            <h2 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              {FINAL_CTA.title}{" "}
              <span className="bg-linear-to-r from-[#8fd0ff] to-[#2f6bff] bg-clip-text text-transparent">
                {FINAL_CTA.highlight}
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              {FINAL_CTA.subtitle}
            </p>
            <div className="mt-9 flex justify-center">
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <a href="#waitlist">
                  {FINAL_CTA.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ─────────────────────── Footer ─────────────────────── */}
      <footer className="border-t border-white/10 bg-[#060912]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-4">
              <HarmonyLogo />
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                {FOOTER.tagline}
              </p>
            </div>
            {FOOTER.columns.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-foreground">{col.title}</p>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.href.startsWith("/") ? (
                        <Link
                          href={l.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {l.label}
                        </Link>
                      ) : (
                        <a
                          href={l.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl">{FOOTER.note}</p>
            <p>© {new Date().getFullYear()} AIOS. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
