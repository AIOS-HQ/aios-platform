import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { HarmonyMark } from "@/components/brand/harmony-logo";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: {
    absolute: "Harmony — The Autonomous Operating System for Life and Business",
  },
  description:
    "Harmony is the autonomous operating system that unifies your personal life and your business, then puts AI helpers to work — planning, coordinating, and executing under your command.",
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
    description:
      "Run your life. Run your business. Harmony handles the work — one operating system with a team of AI helpers, under your command.",
    siteName: "Harmony",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Harmony — The Autonomous Operating System",
    description: "Run your life. Run your business. Harmony handles the work.",
  },
};

/* ----------------------------- content shapes ----------------------------- */
type IconText = { icon: string; title: string; body: string };
type Stat = { value: string; label: string };
type SnapshotCard = { icon: string; name: string; items: string[] };
type Hero = {
  badge: string;
  titleLead: string;
  titleHighlight: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  proof: string;
  stats: Stat[];
  snapshot: { os: string; live: string; caption: string; cards: SnapshotCard[] };
};
type Audiences = { label: string; items: string[] };
type CustomerIntelligenceBanner = {
  label: string;
  title: string;
  body: string;
  signals: { icon: string; label: string; value: string }[];
};
type ProblemSection = { eyebrow: string; title: string; subtitle: string; pains: IconText[] };
type WhySection = { eyebrow: string; title: string; subtitle: string; pillars: IconText[] };
type Hub = { id: string; eyebrow: string; title: string; subtitle: string; features: IconText[] };
type LadderStep = { step: string; title: string; body: string };
type AutomationSection = {
  eyebrow: string;
  title: string;
  subtitle: string;
  helpers: IconText[];
  ladder: { title: string; body: string; steps: LadderStep[] };
};
type IntegrationItem = { name: string; initials: string; note: string };
type IntegrationsSection = {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: IntegrationItem[];
  footnote: string;
};
type PanelRow = { label: string; value: string; tone: string };
type CommandCenterSection = {
  eyebrow: string;
  title: string;
  subtitle: string;
  features: IconText[];
  panel: {
    title: string;
    status: string;
    activityTitle: string;
    rows: PanelRow[];
    activity: string[];
  };
};
type FaqSection = { eyebrow: string; title: string; items: { q: string; a: string }[] };
type EarlyAccessSection = {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  perks: string[];
};
type FinalCtaSection = { titleLead: string; titleHighlight: string; subtitle: string; cta: string };

/* ------------------------------- icon lookup ------------------------------ */
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

function FeatureCard({ icon, title, body }: IconText) {
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

function HubVisualCard({ icon, name, items }: SnapshotCard) {
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
  const t = useTranslations("landing");

  const hero = t.raw("hero") as Hero;
  const audiences = t.raw("audiences") as Audiences;
  const customerIntelligence = t.raw("customerIntelligence") as CustomerIntelligenceBanner;
  const problem = t.raw("problem") as ProblemSection;
  const why = t.raw("why") as WhySection;
  const hubs = t.raw("hubs") as Hub[];
  const automation = t.raw("automation") as AutomationSection;
  const integrations = t.raw("integrations") as IntegrationsSection;
  const commandCenter = t.raw("commandCenter") as CommandCenterSection;
  const faq = t.raw("faq") as FaqSection;
  const earlyAccess = t.raw("earlyAccess") as EarlyAccessSection;
  const finalCta = t.raw("finalCta") as FinalCtaSection;

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
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-28 lg:px-8">
            <div className="flex flex-col items-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-foreground/90 backdrop-blur">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                {hero.badge}
              </span>

              <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                {hero.titleLead}{" "}
                <span className="bg-linear-to-r from-[#8fd0ff] to-[#2f6bff] bg-clip-text text-transparent">
                  {hero.titleHighlight}
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                {hero.subtitle}
              </p>

              <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="h-12 px-7 text-base">
                  <a href="#waitlist">
                    {hero.primaryCta}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/20 bg-transparent px-7 text-base text-foreground hover:bg-white/5"
                >
                  <a href="#why">{hero.secondaryCta}</a>
                </Button>
              </div>

              <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                {hero.proof}
              </p>

              <dl className="mt-10 grid w-full max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {hero.stats.map((s) => (
                  <div key={s.label} className="flex flex-col">
                    <dt className="order-2 text-xs text-muted-foreground">{s.label}</dt>
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
                className="pointer-events-none absolute -inset-4 rounded-[2rem] border border-primary/20"
                aria-hidden="true"
              />
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="relative flex size-2.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                    </span>
                    {hero.snapshot.os}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {hero.snapshot.live}
                  </span>
                </div>

                <div className="my-6 flex flex-col items-center justify-center gap-3 py-2">
                  <div className="relative">
                    <div
                      className="pointer-events-none absolute -inset-4 rounded-[1.75rem] border border-primary/30"
                      aria-hidden="true"
                    />
                    <HarmonyMark className="relative size-20" title="Harmony" />
                  </div>
                  <p className="text-sm text-muted-foreground">{hero.snapshot.caption}</p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {hero.snapshot.cards.map((card) => (
                    <HubVisualCard key={card.name} icon={card.icon} name={card.name} items={card.items} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Audience strip */}
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {audiences.label}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                {audiences.items.map((a) => (
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

          {/* Customer intelligence banner */}
          <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
            <div className="grid gap-5 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {customerIntelligence.label}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  {customerIntelligence.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {customerIntelligence.body}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[32rem]">
                {customerIntelligence.signals.map((signal) => (
                  <div key={signal.label} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Icon name={signal.icon} className="size-4 text-primary" />
                      {signal.label}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{signal.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Problem ─────────────────────── */}
        <section className="scroll-mt-24 border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>{problem.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {problem.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">{problem.subtitle}</p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {problem.pains.map((p) => (
                <FeatureCard key={p.title} icon={p.icon} title={p.title} body={p.body} />
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────── Why Harmony ─────────────────────── */}
        <section id="why" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>{why.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {why.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">{why.subtitle}</p>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {why.pillars.map((p) => (
                <FeatureCard key={p.title} icon={p.icon} title={p.title} body={p.body} />
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────── Hubs ─────────────────────── */}
        {hubs.map((hub, i) => (
          <section
            key={hub.id}
            id={hub.id}
            className={
              "scroll-mt-24 border-t border-white/[0.06]" + (i % 2 === 1 ? " bg-white/[0.015]" : "")
            }
          >
            <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
              <div className="max-w-3xl">
                <Eyebrow>{hub.eyebrow}</Eyebrow>
                <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                  {hub.title}
                </h2>
                <p className="mt-4 text-pretty text-lg text-muted-foreground">{hub.subtitle}</p>
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
              <Eyebrow>{automation.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {automation.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">{automation.subtitle}</p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {automation.helpers.map((h) => (
                <FeatureCard key={h.title} icon={h.icon} title={h.title} body={h.body} />
              ))}
            </div>

            <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
              <div className="max-w-2xl">
                <h3 className="text-xl font-semibold text-foreground sm:text-2xl">
                  {automation.ladder.title}
                </h3>
                <p className="mt-3 text-muted-foreground">{automation.ladder.body}</p>
              </div>
              <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {automation.ladder.steps.map((s, idx) => (
                  <li key={s.step} className="relative flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
                        {s.step}
                      </span>
                      {idx < automation.ladder.steps.length - 1 && (
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
              <Eyebrow>{integrations.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {integrations.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">{integrations.subtitle}</p>
            </div>
            <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {integrations.items.map((it) => (
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
            <p className="mt-8 text-center text-sm text-muted-foreground">{integrations.footnote}</p>
          </div>
        </section>

        {/* ─────────────────── Founder Command Center ─────────────────── */}
        <section id="command-center" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
            <div>
              <Eyebrow>{commandCenter.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {commandCenter.title}
              </h2>
              <p className="mt-4 text-pretty text-lg text-muted-foreground">
                {commandCenter.subtitle}
              </p>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {commandCenter.features.map((f) => (
                  <li key={f.title} className="flex gap-3">
                    <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={f.icon} className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{f.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Command center panel mock */}
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-4 rounded-[2rem] border border-primary/20"
                aria-hidden="true"
              />
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1020]/80 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Gauge className="size-4 text-primary" aria-hidden="true" />
                    {commandCenter.panel.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    {commandCenter.panel.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px bg-white/10">
                  {commandCenter.panel.rows.map((r) => (
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
                    {commandCenter.panel.activityTitle}
                  </p>
                  {commandCenter.panel.activity.map((a) => (
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
              <Eyebrow>{faq.eyebrow}</Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {faq.title}
              </h2>
            </div>
            <div className="mt-12 flex flex-col gap-3">
              {faq.items.map((f) => (
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
                  <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Button
                asChild
                variant="outline"
                className="border-white/20 bg-transparent text-foreground hover:bg-white/5"
              >
                <Link href="/faq">
                  {t("faq.seeAll")}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Early Access ─────────────────────── */}
        <section id="early-access" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="overflow-hidden rounded-3xl border border-primary/20 bg-linear-to-br from-primary/[0.12] to-transparent p-8 sm:p-12">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
                <div>
                  <Eyebrow>{earlyAccess.eyebrow}</Eyebrow>
                  <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                    {earlyAccess.title}
                  </h2>
                  <p className="mt-4 text-pretty text-lg text-muted-foreground">
                    {earlyAccess.subtitle}
                  </p>
                  <Button asChild size="lg" className="mt-8 h-12 px-7 text-base">
                    <a href="#waitlist">
                      {earlyAccess.cta}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
                <ul className="grid gap-4">
                  {earlyAccess.perks.map((perk) => (
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
            <Eyebrow>{t("waitlist.eyebrow")}</Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {t("waitlist.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              {t("waitlist.subtitle")}
            </p>
            <div className="mx-auto mt-8 max-w-lg">
              <WaitlistForm source="waitlist" />
              <p className="mt-3 text-xs text-muted-foreground">{t("waitlist.disclaimer")}</p>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Final CTA ─────────────────────── */}
        <section className="relative overflow-hidden border-t border-white/[0.06]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8 lg:py-32">
            <HarmonyMark className="mx-auto size-12" title="Harmony" />
            <h2 className="mt-6 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              {finalCta.titleLead}{" "}
              <span className="bg-linear-to-r from-[#8fd0ff] to-[#2f6bff] bg-clip-text text-transparent">
                {finalCta.titleHighlight}
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              {finalCta.subtitle}
            </p>
            <div className="mt-9 flex justify-center">
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <a href="#waitlist">
                  {finalCta.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <SiteFooter />
    </div>
  );
}
