import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check } from "lucide-react";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicNavbar } from "@/components/marketing/public-navbar";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing · AIOS",
  description:
    "Explore AIOS launch pricing options for individuals, professionals, teams, and enterprise operators. Billing and purchases are not enabled on the public website.",
};

type PlanCopy = {
  name: string;
  price: string;
  priceSuffix: string;
  tagline: string;
  cta: string;
  features: string[];
};

const PUBLIC_PLANS = [
  { id: "starter", popular: false, href: "/signup" },
  { id: "professional", popular: true, href: "/signup" },
  { id: "business", popular: false, href: "/signup" },
  { id: "enterprise", popular: false, href: "/help" },
] as const;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const t = await getTranslations("pricing");
  const sp = await searchParams;
  const gated = typeof sp.from === "string";

  return (
    <div className="harmony-marketing relative min-h-dvh bg-background text-foreground">
      <PublicNavbar />

      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/[0.06]">
          <div
            className="pointer-events-none absolute left-1/2 top-[-30%] h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
            {gated ? (
              <div className="mx-auto mb-6 max-w-xl rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
                <p className="font-semibold text-foreground">{t("gate.title")}</p>
                <p className="mt-1 text-muted-foreground">{t("gate.body")}</p>
              </div>
            ) : null}
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
            {PUBLIC_PLANS.map((plan) => {
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
                    <Button
                      asChild
                      size="lg"
                      variant={plan.popular ? "default" : "outline"}
                      className={
                        plan.popular
                          ? "w-full"
                          : "w-full border-white/20 bg-transparent text-foreground hover:bg-white/5"
                      }
                    >
                      <Link href={plan.href}>
                        {plan.id === "enterprise" ? c.cta : "Join the launch list"}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
            <p className="text-sm font-medium text-foreground">Billing is not enabled on the public website.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Pricing is published for launch planning only. AIOS does not process public
              purchases, Stripe checkout, payments, or entitlements from this page.
            </p>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
            {t("hubsNote")}
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
