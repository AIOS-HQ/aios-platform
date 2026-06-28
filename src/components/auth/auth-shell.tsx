"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HarmonyLogo, HarmonyMark } from "@/components/brand/harmony-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedAudience = "customer" | "founder";
type FeedTone = "status" | "feature" | "benefit" | "alert";
type FeedItem = {
  label: string;
  title: string;
  body: string;
  tone: FeedTone;
};

const toneIcon = {
  status: CheckCircle2,
  feature: Sparkles,
  benefit: ShieldCheck,
  alert: CircleAlert,
} satisfies Record<FeedTone, typeof Bell>;

function HarmonyLiveFeed({ audience = "customer" }: { audience?: FeedAudience }) {
  const t = useTranslations("auth.executive.feed");
  const items = t.raw(audience) as FeedItem[];
  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(b.tone === "alert") - Number(a.tone === "alert")),
    [items],
  );
  const [index, setIndex] = useState(0);
  const item = sorted[index] ?? sorted[0];
  const Icon = toneIcon[item?.tone ?? "status"];

  function previous() {
    setIndex((current) => (current === 0 ? sorted.length - 1 : current - 1));
  }

  function next() {
    setIndex((current) => (current + 1) % sorted.length);
  }

  return (
    <section
      className="auth-executive-panel flex min-h-[7.5rem] flex-col justify-between p-4 sm:p-5 lg:h-[15dvh] lg:min-h-[7.75rem] lg:max-h-36"
      aria-label={t("label")}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border",
            item?.tone === "alert"
              ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
              : "border-sky-300/20 bg-sky-300/10 text-sky-200",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200/80">
            {item?.label}
          </p>
          <h2 className="mt-1 text-base font-semibold leading-tight text-white sm:text-lg">
            {item?.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-300">{item?.body}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {sorted.map((entry, i) => (
            <span
              key={`${entry.title}-${i}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-5 bg-sky-300" : "w-1.5 bg-white/20",
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={previous}
            className="inline-flex size-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08]"
            aria-label={t("previous")}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex size-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08]"
            aria-label={t("next")}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

export function AuthShell({
  children,
  feedAudience = "customer",
}: {
  children: React.ReactNode;
  feedAudience?: FeedAudience;
}) {
  const t = useTranslations("auth.executive");
  const signals = t.raw("signals") as string[];

  return (
    <div className="auth-executive relative min-h-dvh overflow-hidden bg-[#050814] text-white">
      <div className="pointer-events-none absolute inset-0 harmony-grid opacity-30" aria-hidden="true" />
      <div
        className="pointer-events-none absolute left-1/2 top-[-14rem] h-[42rem] w-[60rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-[150px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-[-18rem] right-[-12rem] h-[40rem] w-[40rem] rounded-full bg-violet-500/15 blur-[150px]"
        aria-hidden="true"
      />
      <HarmonyMark
        className="pointer-events-none absolute left-1/2 top-1/2 size-[22rem] -translate-x-1/2 -translate-y-1/2 opacity-[0.07] blur-[0.2px] sm:size-[30rem] lg:left-[35%]"
      />

      <header className="relative z-10 flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label={t("homeAria")} className="inline-flex">
          <HarmonyLogo markClassName="size-11 sm:size-12" className="text-white" />
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main id="main-content" className="relative z-10 px-4 pb-8 pt-2 sm:px-6 lg:px-8">
        <div className="mx-auto grid min-h-[calc(100dvh-6rem)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="auth-executive-rail max-w-lg p-5">
              <HarmonyMark className="size-16" title="Harmony" />
              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-sky-200/80">
                {t("eyebrow")}
              </p>
              <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.02] tracking-tight text-white">
                {t("title")}
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">{t("subtitle")}</p>
              <div className="mt-8 grid max-w-md gap-3">
                {signals.map((signal) => (
                  <div
                    key={signal}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-slate-200"
                  >
                    <span className="size-1.5 rounded-full bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.8)]" />
                    {signal}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-2">
            <HarmonyLiveFeed audience={feedAudience} />
            <div className="auth-executive-panel auth-executive-workspace overflow-hidden">
              {children}
            </div>
            <div className="auth-executive-panel flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-300">
              <span className="min-w-0">{t("support")}</span>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="shrink-0 text-sky-100 hover:bg-white/10 hover:text-white"
              >
                <Link href="/help">
                  {t("supportCta")}
                  <ArrowLeft className="size-3.5 rotate-180" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
