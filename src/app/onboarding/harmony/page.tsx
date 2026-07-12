import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Brain, Sparkles } from "lucide-react";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { HarmonyMark } from "@/components/brand/harmony-logo";
import {
  OnboardingFlow,
  type OnboardingFlowData,
  type OnboardingUi,
} from "@/components/marketing/onboarding-flow";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Get Started with Harmony",
  description:
    "Set up your hubs and meet the AI helpers that handle the work — a quick guided start for your Harmony operating system.",
};

export default function HarmonyOnboardingPage() {
  const t = useTranslations("onboarding");
  const flow = t.raw("harmony") as OnboardingFlowData;
  const ui = t.raw("ui") as OnboardingUi;

  return (
    <div className="auth-executive relative min-h-dvh overflow-hidden bg-[#050814] text-white">
      <div className="pointer-events-none absolute inset-0 harmony-grid opacity-30" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-sky-300/70 to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-[-14rem] h-[42rem] w-[60rem] -translate-x-1/2 rounded-full bg-sky-500/18 blur-[150px]"
        aria-hidden="true"
      />
      <HarmonyMark
        className="pointer-events-none absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 opacity-[0.09] blur-[0.2px] sm:size-[32rem]"
      />

      <header className="relative z-10 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link href="/" aria-label={ui.home} className="inline-flex">
            <AiosHarmonyLogo
              inverse
              aiosMarkClassName="size-10 sm:size-11"
              harmonyMarkClassName="size-10 sm:size-11"
            />
          </Link>
          <Button asChild variant="ghost" size="sm" className="text-sky-100 hover:bg-white/10 hover:text-white">
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {ui.back}
            </Link>
          </Button>
        </div>
      </header>

      <main id="main-content" className="relative z-10 px-4 pb-10 pt-2 sm:px-6 lg:px-8">
        <div className="mx-auto grid min-h-[calc(100dvh-6rem)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,34rem)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="auth-executive-rail max-w-xl p-6">
              <HarmonyMark className="size-20" title="Harmony" />
              <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-sky-200/80">
                {flow.eyebrow}
              </p>
              <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.02] tracking-tight text-white">
                {flow.title}
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">{flow.subtitle}</p>
              <div className="mt-8 grid max-w-md gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-slate-200">
                  <Sparkles className="size-4 text-sky-200" aria-hidden="true" />
                  {flow.steps[0]?.points[0]}
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm text-slate-200">
                  <Brain className="size-4 text-sky-200" aria-hidden="true" />
                  {flow.steps[3]?.points[0]}
                </div>
              </div>
            </div>
          </aside>

          <div className="mx-auto w-full max-w-[34rem]">
            <div className="auth-executive-panel p-5 sm:p-6">
              <div className="mb-8 text-center lg:hidden">
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                  {flow.eyebrow}
                </span>
                <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white">
                  {flow.title}
                </h1>
                <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-6 text-slate-300">
                  {flow.subtitle}
                </p>
              </div>
              <OnboardingFlow flow={flow} ui={ui} storageKey="harmony-onboarding-product" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
