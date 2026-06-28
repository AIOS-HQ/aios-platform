"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Gauge,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type OnboardingStep = { icon: string; title: string; body: string; points: string[] };
export type OnboardingCta = { label: string; href: string };
export type OnboardingFlowData = {
  eyebrow: string;
  title: string;
  subtitle: string;
  steps: OnboardingStep[];
  done: { title: string; body: string; primaryCta: OnboardingCta; secondaryCta: OnboardingCta };
};
export type OnboardingUi = {
  step: string;
  of: string;
  back: string;
  next: string;
  finish: string;
  skip: string;
  restart: string;
  progress: string;
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Sparkles,
  Network,
  Building2,
  ShieldCheck,
  Gauge,
  Calendar,
  Brain,
  CheckCircle2,
};

// Resolve icon names to components; default to Sparkles for anything unknown.
function StepIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name] ?? Sparkles;
  return <Cmp className={className} />;
}

export function OnboardingFlow({
  flow,
  ui,
  storageKey,
}: {
  flow: OnboardingFlowData;
  ui: OnboardingUi;
  storageKey: string;
}) {
  const total = flow.steps.length;
  const [index, setIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved !== null) {
        const n = Number.parseInt(saved, 10);
        if (Number.isFinite(n) && n >= 0 && n <= total) return n;
      }
    } catch {
      /* ignore storage errors */
    }
    return 0;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(index));
    } catch {
      /* ignore storage errors */
    }
  }, [index, storageKey]);

  const done = index >= total;
  const pct = Math.round((Math.min(index, total) / total) * 100);

  if (done) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {flow.done.title}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-pretty text-lg text-muted-foreground">
          {flow.done.body}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 px-7 text-base">
            <Link href={flow.done.primaryCta.href}>
              {flow.done.primaryCta.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 border-white/20 bg-transparent px-7 text-base text-foreground hover:bg-white/5"
          >
            <Link href={flow.done.secondaryCta.href}>{flow.done.secondaryCta.label}</Link>
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setIndex(0)}
          className="mt-6 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {ui.restart}
        </button>
      </div>
    );
  }

  const step = flow.steps[index];

  return (
    <div className="mx-auto max-w-xl">
      {/* progress */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {ui.step} {index + 1} {ui.of} {total}
          </span>
          <span>
            {pct}% {ui.progress}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* step card */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-primary/10 text-primary">
          <StepIcon name={step.icon} className="size-6" />
        </span>
        <h3 className="mt-5 text-2xl font-bold tracking-tight">{step.title}</h3>
        <p className="mt-3 text-pretty text-muted-foreground">{step.body}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {step.points.map((point) => (
            <li key={point} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span className="text-sm text-foreground/90">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* nav */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {ui.back}
        </Button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIndex(total)}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {ui.skip}
          </button>
          <Button onClick={() => setIndex((i) => Math.min(total, i + 1))} className="px-6">
            {index === total - 1 ? ui.finish : ui.next}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
