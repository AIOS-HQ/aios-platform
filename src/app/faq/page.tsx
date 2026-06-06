import type { Metadata } from "next";
import type { ComponentType } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Bell,
  ChevronDown,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers about Harmony — the product and its hubs, the AI helpers, your data and privacy, and how to get access.",
};

type FaqItem = { q: string; a: string };
type FaqCategory = { id: string; icon: string; title: string; items: FaqItem[] };
type FaqCta = { title: string; body: string; button: string; href: string };

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Sparkles,
  LayoutDashboard,
  Zap,
  ShieldCheck,
  Bell,
};

export default function FaqPage() {
  const t = useTranslations("faqPage");
  const categories = t.raw("categories") as FaqCategory[];
  const cta = t.raw("cta") as FaqCta;

  return (
    <div className="harmony-marketing relative min-h-dvh bg-background text-foreground">
      <SiteHeader />

      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/[0.06]">
          <div
            className="pointer-events-none absolute left-1/2 top-[-30%] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
              {t("eyebrow")}
              <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
              {t("subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.id}`}
                  className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-foreground/90 transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {c.title}
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Categories */}
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          {categories.map((category) => {
            const CatIcon = ICONS[category.icon] ?? Sparkles;
            return (
              <section
                key={category.id}
                id={`cat-${category.id}`}
                className="scroll-mt-24 border-b border-white/[0.06] py-14 last:border-b-0"
              >
                <div className="mb-8 flex items-center gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-xl border border-white/10 bg-primary/10 text-primary">
                    <CatIcon className="size-5" />
                  </span>
                  <h2 className="text-2xl font-bold tracking-tight">{category.title}</h2>
                </div>
                <div className="flex flex-col gap-3">
                  {category.items.map((item) => (
                    <details
                      key={item.q}
                      className="group rounded-2xl border border-white/10 bg-white/[0.03] px-5 [&>summary]:list-none"
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-4 py-5 text-left text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                        {item.q}
                        <ChevronDown
                          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* CTA */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{cta.title}</h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">{cta.body}</p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" className="h-12 px-7 text-base">
                <Link href={cta.href}>
                  {cta.button}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
