import type { Metadata } from "next";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicNavbar } from "@/components/marketing/public-navbar";

export const metadata: Metadata = {
  title: "Privacy · AIOS",
  description:
    "AIOS privacy principles, data handling commitments, and starter privacy terms for the public launch website.",
};

const SECTIONS = [
  {
    title: "What AIOS collects",
    body: "AIOS collects account information you provide, workspace configuration, usage events needed to operate the product, and content you choose to add to the platform. Public website analytics, if enabled, should be limited to launch-readiness and site performance measurement.",
  },
  {
    title: "How AIOS uses data",
    body: "AIOS uses data to operate Harmony, coordinate AI workers, maintain security, support the marketplace experience, improve reliability, and respond to support requests. AIOS does not sell customer data.",
  },
  {
    title: "AI and automation",
    body: "Harmony and the AIOS workforce use company context to assist with planning, coordination, and execution. High-risk or external actions are designed to remain approval-gated unless a customer explicitly enables a higher autonomy policy.",
  },
  {
    title: "Integrations",
    body: "When you connect third-party tools, AIOS receives only the access authorized through that connector. Connector access should be reviewed and revoked from settings or the provider if no longer needed.",
  },
  {
    title: "Data ownership and deletion",
    body: "Customers own their workspace data. AIOS should provide export, retention, and deletion paths appropriate to the account type, legal obligations, and operational safety requirements.",
  },
  {
    title: "Contact",
    body: "For privacy questions, contact the AIOS team through the Help Center. This starter policy should be reviewed by counsel before production launch.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="harmony-marketing min-h-dvh bg-background text-foreground">
      <PublicNavbar />
      <main id="main-content">
        <section className="border-b border-white/[0.06]">
          <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Legal</p>
            <h1 className="mt-4 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
              Starter privacy terms for AIOS public launch preparation. This page is informational and should be finalized with legal counsel before production launch.
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
