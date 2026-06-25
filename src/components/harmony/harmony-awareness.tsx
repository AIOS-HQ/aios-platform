import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getHarmonyAwareness } from "@/lib/harmony/awareness";
import { HarmonyMark } from "@/components/brand/harmony-logo";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Executive Awareness — Harmony tells you where things stand the moment you open
 * her. Reuses Work Queue, Recommendations, Objectives, Autonomy, Review/A2A, and
 * personal tasks/goals/notes (no duplicated systems).
 *
 * Two renders, one data source:
 * - Founder: a persistent operational hub. The capabilities that were removed
 *   from the founder sidebar (Briefing, Objectives, Operations, Work Management,
 *   Tasks, Goals, Notes) live here as always-visible links — Harmony is the
 *   single operational interface — with live counts as badges. Labels reuse the
 *   `nav` namespace so the names match what left the sidebar (no new strings).
 * - Customer: status chips (shown only when they have a value), unchanged.
 */
export async function HarmonyAwareness() {
  const t = await getTranslations("operator.awareness");
  const user = await requireUser();
  const [a, isFounder] = await Promise.all([
    getHarmonyAwareness(user.id),
    currentUserIsAdmin(),
  ]);

  if (isFounder) {
    const tNav = await getTranslations("nav");
    const hub: { label: string; value: number; href: string; alert?: boolean }[] = [
      { label: tNav("briefing"), value: a.completedToday, href: "/harmony/briefing" },
      { label: tNav("objectives"), value: a.priorities, href: "/harmony/objectives" },
      {
        label: tNav("operations"),
        value: a.blockedWork,
        href: "/harmony/operations",
        alert: a.blockedWork > 0,
      },
      { label: tNav("work"), value: a.activeWork, href: "/harmony/work" },
      { label: tNav("tasks"), value: a.openTasks, href: "/harmony/tasks" },
      { label: tNav("goals"), value: a.activeGoals, href: "/harmony/goals" },
      { label: tNav("notes"), value: a.notes, href: "/harmony/notes" },
    ];

    return (
      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <HarmonyMark className="size-5" title="Harmony" />
            {t("title")}
          </div>
          <div className="flex flex-wrap gap-2">
            {hub.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-accent ${
                  c.alert ? "border-destructive/40 text-destructive" : ""
                }`}
              >
                <span>{c.label}</span>
                {c.value > 0 && (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                      c.alert
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {c.value}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

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
