import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import {
  HelpCenterView,
  type HelpCategory,
} from "@/components/marketing/help-center-view";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Guides and answers to get the most out of Harmony — across your Personal Hub, Business Hub, and the Harmony Hub.",
};

type Contact = { title: string; body: string; button: string; href: string };

export default function HelpPage() {
  const t = useTranslations("helpCenter");
  const categories = t.raw("categories") as HelpCategory[];
  const contact = t.raw("contact") as Contact;

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
          </div>
        </section>

        {/* Categories + search */}
        <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <HelpCenterView
            categories={categories}
            labels={{
              searchPlaceholder: t("searchPlaceholder"),
              noResults: t("noResults"),
              resultsLabel: t("resultsLabel"),
            }}
          />
        </section>

        {/* Contact CTA */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {contact.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              {contact.body}
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" className="h-12 px-7 text-base">
                <Link href={contact.href}>
                  {contact.button}
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
