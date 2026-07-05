import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared marketing primitives for the public website (AIOS design tokens).
 * TODO(codex): i18n the copy passed in; add scroll animations / imagery.
 */

export function MarketingHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b bg-linear-to-b from-primary/5 to-transparent">
      <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:py-28">
        {eyebrow ? (
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">{subtitle}</p>
        {children ? <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
      </div>
    </section>
  );
}

export function CtaLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
}) {
  const cls =
    variant === "primary"
      ? "rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      : "rounded-lg border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent";
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16">
      <div className="mb-8 max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle ? <p className="mt-2 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6 transition hover:border-primary/30 hover:shadow-sm">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
