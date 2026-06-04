"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvisorRecommendation, AdvisorTone } from "@/lib/harmony/advisor";

const toneClass: Record<AdvisorTone, string> = {
  info: "border-primary/20 bg-primary/5 text-foreground",
  warning: "border-warning/30 bg-warning/10 text-foreground",
  success: "border-success/30 bg-success/10 text-foreground",
};

const toneIcon = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
} as const;

const toneIconColor: Record<AdvisorTone, string> = {
  info: "text-primary",
  warning: "text-warning",
  success: "text-success",
};

const toneOrder: Record<AdvisorTone, number> = {
  warning: 0,
  info: 1,
  success: 2,
};

/** Where each recommendation's "View" CTA deep-links to. */
const hrefForKey: Record<string, string | undefined> = {
  dueToday: "/harmony/tasks",
  overdue: "/harmony/tasks",
  staleGoals: "/harmony/goals",
  almostThere: "/harmony/goals",
  organizeNotes: "/harmony/notes",
  firstTask: "/harmony/tasks",
  firstGoal: "/harmony/goals",
};

export function AdvisorPanel({
  recommendations,
  limit,
}: {
  recommendations: AdvisorRecommendation[];
  limit?: number;
}) {
  const t = useTranslations("advisor");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const items = useMemo(() => {
    const visible = recommendations
      .filter((r) => !dismissed.includes(r.id))
      .sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
    return typeof limit === "number" ? visible.slice(0, limit) : visible;
  }, [recommendations, dismissed, limit]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const Icon = toneIcon[r.tone];
        const href = hrefForKey[r.key];
        return (
          <li
            key={r.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-sm",
              toneClass[r.tone],
            )}
          >
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", toneIconColor[r.tone])}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p>{t(`rec.${r.key}`, r.values ?? {})}</p>
              {href && (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {t("view")}
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => setDismissed((d) => [...d, r.id])}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("dismiss")}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
