import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { getHarmonyAwareness } from "@/lib/harmony/awareness";
import { HarmonyMark } from "@/components/brand/harmony-logo";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Executive Awareness — Harmony tells you where things stand the moment you open
 * her. Reuses Work Queue, Recommendations, Objectives, Autonomy, Review/A2A, and
 * personal tasks/goals (no duplicated systems). Org signals show only when the
 * user has a company; everyone sees their personal tasks/goals.
 */
export async function HarmonyAwareness() {
  const t = await getTranslations("operator.awareness");
  const user = await requireUser();
  const a = await getHarmonyAwareness(user.id);

  const chips: { label: string; value: number; href: string; alert?: boolean }[] = [];
  if (a.hasCompany) {
    chips.push({ label: t("completed"), value: a.completedToday, href: "/harmony/briefing" });
    chips.push({ label: t("waiting"), value: a.waitingApprovals, href: "/harmony/review" });
    chips.push({ label: t("opportunities"), value: a.opportunities, href: "/harmony/review" });
    chips.push({ label: t("priorities"), value: a.priorities, href: "/harmony/objectives" });
    chips.push({
      label: t("blocked"),
      value: a.blockedWork,
      href: "/harmony/operations",
      alert: a.blockedWork > 0,
    });
  }
  chips.push({ label: t("tasks"), value: a.openTasks, href: "/harmony/tasks" });
  chips.push({ label: t("goals"), value: a.activeGoals, href: "/harmony/goals" });

  const visible = chips.filter((c) => c.value > 0);

  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <HarmonyMark className="size-5" title="Harmony" />
          {t("title")}
        </span>
        {visible.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t("allClear")}</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visible.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-accent ${
                  c.alert ? "border-destructive/40 text-destructive" : ""
                }`}
              >
                <span className="font-semibold tabular-nums">{c.value}</span>
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
