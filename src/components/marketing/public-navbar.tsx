import Link from "next/link";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

/**
 * Public marketing navbar — shared across the (marketing) route group.
 *
 * Server component, responsive with NO client JS: the mobile menu uses a native
 * <details> disclosure. Links point at the public website pages plus the
 * existing auth routes (/login, /signup). Uses the AIOS design tokens
 * (background/foreground/primary/border) so it matches the app.
 */

export const PUBLIC_NAV_LINKS: { href: string; label: string }[] = [
  { href: "/features", label: "Features" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/ai-workforce", label: "AI Workforce" },
  { href: "/templates", label: "Company Templates" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="inline-flex min-w-0 items-center" aria-label={`${APP_NAME} home`}>
          <AiosHarmonyLogo />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          {PUBLIC_NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Log in
          </Link>
          <Link href="/signup" className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            Join Founder Beta
          </Link>
        </div>

        {/* Mobile disclosure (no client JS) */}
        <details className="relative md:hidden [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium">Menu</summary>
          <div className="absolute right-0 z-50 mt-2 flex w-56 flex-col gap-1 rounded-xl border bg-background p-2 shadow-lg">
            {PUBLIC_NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                {l.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium">Log in</Link>
            <Link href="/signup" className="rounded-md bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground">
              Join Founder Beta
            </Link>
          </div>
        </details>
      </nav>
    </header>
  );
}
