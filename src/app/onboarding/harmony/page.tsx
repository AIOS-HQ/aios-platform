import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HarmonyLogo } from "@/components/brand/harmony-logo";
import {
  OnboardingFlow,
  type OnboardingFlowData,
  type OnboardingUi,
} from "@/components/marketing/onboarding-flow";

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
    <div className="harmony-marketing relative min-h-dvh bg-background text-foreground">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Harmony home">
            <HarmonyLogo />
          </Link>
        </div>
      </header>

      <main id="main-content" className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute left-1/2 top-[-20%] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-10 text-center">
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
              {flow.eyebrow}
              <span className="h-px w-6 bg-primary/50" aria-hidden="true" />
            </span>
            <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {flow.title}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              {flow.subtitle}
            </p>
          </div>
          <OnboardingFlow flow={flow} ui={ui} storageKey="harmony-onboarding-product" />
        </div>
      </main>
    </div>
  );
}
