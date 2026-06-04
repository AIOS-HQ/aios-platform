import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Stat = {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  /** Highlight in destructive color when value > 0 (e.g. overdue). */
  emphasis?: boolean;
};

/** Compact at-a-glance metric tiles for the dashboard. */
export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => {
        const Icon = s.icon;
        const alert = Boolean(s.emphasis && s.value > 0);
        const body = (
          <div
            className={cn(
              "flex h-full flex-col justify-between rounded-xl border bg-card p-4",
              s.href &&
                "transition-colors hover:border-primary/40 hover:bg-accent/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {s.label}
              </span>
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  alert ? "text-destructive" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </div>
            <span
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums",
                alert && "text-destructive",
              )}
            >
              {s.value}
            </span>
          </div>
        );

        return s.href ? (
          <Link
            key={s.key}
            href={s.href}
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          <div key={s.key}>{body}</div>
        );
      })}
    </div>
  );
}
