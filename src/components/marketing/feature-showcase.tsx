import type { ComponentType } from "react";
import {
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  GitBranch,
  LayoutDashboard,
  Network,
  Plug,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Marketing feature showcase — the flagship landing sections that demonstrate
 * AIOS deploys COMPLETE autonomous companies: the Marketplace, Portable Company,
 * Autonomous Company Provisioning, and Company Templates. Content is fully i18n
 * (the `marketingFeatures` catalog); this component only renders it. Matches the
 * marketing dark aesthetic used by the landing page.
 */

/* ------------------------------ content shapes ----------------------------- */
type Category = { icon: string; label: string; body: string };
type Capability = { icon: string; title: string; body: string };
type FlowStep = { step: string; title: string; body: string };
type MarketplaceContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  categories: Category[];
  footnote: string;
  cta: string;
};
type PortableCompanyContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  capabilities: Capability[];
  flowTitle: string;
  flow: FlowStep[];
};
type ProvisioningContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: FlowStep[];
  includesTitle: string;
  includes: string[];
};
type TemplateItem = { name: string; industry: string; tagline: string };
type TemplatesContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: TemplateItem[];
  cta: string;
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ArrowRight,
  Bot,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  GitBranch,
  LayoutDashboard,
  Network,
  Plug,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
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

export function FeatureShowcase() {
  const t = useTranslations("marketingFeatures");
  const marketplace = t.raw("marketplace") as MarketplaceContent;
  const portable = t.raw("portableCompany") as PortableCompanyContent;
  const provisioning = t.raw("provisioning") as ProvisioningContent;
  const templates = t.raw("templates") as TemplatesContent;

  return (
    <>
      {/* ───────────────────── Marketplace ───────────────────── */}
      <section id="marketplace" className="scroll-mt-24 border-t border-white/[0.06]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>{marketplace.eyebrow}</Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {marketplace.title}
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">{marketplace.subtitle}</p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {marketplace.categories.map((c) => (
              <div
                key={c.label}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary">
                  <Icon name={c.icon} className="size-5" />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-foreground">{c.label}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-muted-foreground">
            {marketplace.footnote}
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="h-12 px-7 text-base">
              <a href="#waitlist">
                {marketplace.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ───────────────────── Portable Company ───────────────────── */}
      <section id="portable-company" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>{portable.eyebrow}</Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {portable.title}
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">{portable.subtitle}</p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {portable.capabilities.map((c) => (
              <div
                key={c.title}
                className="flex h-full flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary">
                  <Icon name={c.icon} className="size-5" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
            <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{portable.flowTitle}</h3>
            <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {portable.flow.map((s, idx) => (
                <li key={s.step} className="relative flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
                      {s.step}
                    </span>
                    {idx < portable.flow.length - 1 && (
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

      {/* ───────────────────── Autonomous Provisioning ───────────────────── */}
      <section id="provisioning" className="scroll-mt-24 border-t border-white/[0.06]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>{provisioning.eyebrow}</Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {provisioning.title}
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">{provisioning.subtitle}</p>
          </div>
          <ol className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {provisioning.steps.map((s, idx) => (
              <li key={s.step} className="relative flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
                    {s.step}
                  </span>
                  {idx < provisioning.steps.length - 1 && (
                    <span className="hidden h-px flex-1 bg-linear-to-r from-primary/40 to-transparent lg:block" />
                  )}
                </div>
                <p className="text-base font-semibold text-foreground">{s.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {provisioning.includesTitle}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {provisioning.includes.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-foreground/90"
                >
                  <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── Company Templates ───────────────────── */}
      <section id="templates" className="scroll-mt-24 border-t border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>{templates.eyebrow}</Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {templates.title}
            </h2>
            <p className="mt-4 text-pretty text-lg text-muted-foreground">{templates.subtitle}</p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {templates.items.map((it) => (
              <div
                key={it.name}
                className="flex h-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-1 text-sm font-semibold text-foreground">{it.name}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-primary/80">{it.industry}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{it.tagline}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <Button asChild size="lg" variant="outline" className="h-12 border-white/20 bg-transparent px-7 text-base text-foreground hover:bg-white/5">
              <a href="#waitlist">
                {templates.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
