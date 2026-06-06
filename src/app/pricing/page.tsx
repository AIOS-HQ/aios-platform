import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PLANS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, scalable pricing for Harmony — Starter, Professional, Business, and Enterprise. Every paid plan includes a 14-day free trial.",
};

type PlanCopy = {
  name: string;
  price: string;
  priceSuffix: string;
  tagline: string;
  cta: string;
  features: string[];
};

export default function PricingPage() {
  const t = useTranslations("pricing");

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
            <p className="mt-4 text-sm text-muted-foreground">{t("trialNote")}</p>
          </div>
        </section>

        {/* Plans */}
        <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid items-start gap-6 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const c = t.raw(`plans.${plan.id}`) as PlanCopy;
              return (
                <div
                  key={plan.id}
                  className={
                    "relative flex h-full flex-col rounded-2xl border p-6 " +
                    (plan.popular
                      ? "border-primary/50 bg-primary/[0.06] shadow-xl shadow-primary/10"
                      : "border-white/10 bg-white/[0.03]")
                  }
                >
                  {plan.popular ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      {t("badgePopular")}
                    </span>
                  ) : null}

                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{c.price}</span>
                    {c.priceSuffix ? (
                      <span className="text-sm text-muted-foreground">{c.priceSuffix}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{c.tagline}</p>

                  <ul className="mt-6 flex flex-1 flex-col gap-3">
                    {c.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    {plan.selfServe ? (
                      <CheckoutButton
                        plan={plan.id}
                        label={c.cta}
                        errorLabel={t("ctaError")}
                        variant={plan.popular ? "default" : "outline"}
                        className={
                          plan.popular
                            ? ""
                            : "border-white/20 bg-transparent text-foreground hover:bg-white/5"
                        }
                      />
                    ) : (
                      <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="w-full border-white/20 bg-transparent text-foreground hover:bg-white/5"
                      >
                        <Link href="/#waitlist">{c.cta}</Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
            {t("hubsNote")}
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
