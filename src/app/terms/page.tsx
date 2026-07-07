import type { Metadata } from "next";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicNavbar } from "@/components/marketing/public-navbar";

export const metadata: Metadata = {
  title: "Terms · AIOS",
  description:
    "Starter AIOS terms of service for public launch preparation, including acceptable use, account responsibility, and automation boundaries.",
};

const SECTIONS = [
  {
    title: "Use of AIOS",
    body: "AIOS provides software for operating AI-assisted workspaces, company context, AI workers, marketplace capabilities, and integrations. You are responsible for using AIOS lawfully and for reviewing AI-generated outputs before relying on them.",
  },
  {
    title: "Accounts and access",
    body: "You are responsible for maintaining account security, protecting credentials, and ensuring only authorized users access your workspace. AIOS may restrict access to protect platform security or comply with law.",
  },
  {
    title: "Human approval",
    body: "AIOS is designed around human oversight. Risky, external, financial, legal, or destructive actions should remain approval-gated unless explicitly configured otherwise by an authorized operator.",
  },
  {
    title: "Marketplace and templates",
    body: "Marketplace items, templates, connectors, and AI workers may be versioned, verified, updated, or withdrawn. Public marketplace visibility does not imply a purchase, entitlement, or billing relationship.",
  },
  {
    title: "Billing status",
    body: "Billing, Stripe checkout, public purchases, payments, and entitlements are not enabled on the public launch website. Any future commercial terms should be documented separately before activation.",
  },
  {
    title: "Changes",
    body: "AIOS may update these starter terms as the product and launch process mature. These terms should be reviewed by counsel before production launch.",
  },
];

export default function TermsPage() {
  return (
    <div className="harmony-marketing min-h-dvh bg-background text-foreground">
      <PublicNavbar />
      <main id="main-content">
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Legal</p>
            <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              Terms of Service
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
              Starter terms for AIOS public launch preparation. This page is informational and should be finalized with legal counsel before production launch.
            </p>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-14 sm:px-6 lg:px-8">
          {SECTIONS.map((section) => (
            <article key={section.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{section.body}</p>
            </article>
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
