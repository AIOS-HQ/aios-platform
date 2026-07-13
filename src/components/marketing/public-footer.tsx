import Link from "next/link";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { APP_NAME, APP_DESCRIPTION, AIOS_PRINCIPLES } from "@/lib/constants";

/**
 * Public marketing footer — shared across the (marketing) route group.
 *
 * Server component. Columns link the public website + existing routes. Uses
 * AIOS design tokens so it matches the app.
 */

const FOOTER_COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/ai-workforce", label: "AI Workforce" },
      { href: "/#automation", label: "How It Works" },
      { href: "/#integrations", label: "Integrations" },
      { href: "/templates", label: "Company Templates" },
      { href: "/marketplace", label: "Marketplace" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/help", label: "Help Center" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/signup", label: "Join Founder Beta" },
    ],
  },
];

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-3">
          <AiosHarmonyLogo />
          <p className="max-w-xs text-sm text-muted-foreground">{APP_DESCRIPTION}</p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {AIOS_PRINCIPLES.map((p) => (
              <li key={p} className="rounded-full border px-2 py-0.5">{p}</li>
            ))}
          </ul>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{col.title}</p>
            {col.links.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-4 text-xs text-muted-foreground sm:flex-row">
          <span>© {year} {APP_NAME}. All rights reserved.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
