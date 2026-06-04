import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Lightbulb,
  ListTodo,
  Sparkles,
  StickyNote,
  Target,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";
import { listTasks, todayTasks } from "@/lib/data/tasks";
import { listGoals } from "@/lib/data/goals";
import { listNotes } from "@/lib/data/notes";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AdvisorPanel } from "@/components/harmony/advisor/advisor-panel";
import { OperatorQuickInput } from "@/components/harmony/operator/operator-quick-input";
import { formatDate } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const user = await requireUser();
  const [profile, tasks, goals, notes] = await Promise.all([
    getProfile(user.id),
    listTasks({ limit: 200 }),
    listGoals({ limit: 200 }),
    listNotes(undefined, 200),
  ]);

  const name = profile?.full_name?.trim() || user.email?.split("@")[0] || "";
  const today = todayTasks(tasks).slice(0, 5);
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 3);
  const recentNotes = notes.slice(0, 4);
  const recommendations = buildRecommendations({ tasks, goals, notes });

  const linkClass =
    "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline";

  return (
    <>
      <PageHeader title={t("welcome", { name })} description={t("subtitle")} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's tasks */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4 text-primary" aria-hidden="true" />
              {t("todayTasks")}
            </CardTitle>
            <Link href="/harmony/tasks" className={linkClass}>
              {t("viewAll")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {today.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noTasksToday")}</p>
            ) : (
              <ul className="space-y-2">
                {today.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate">{task.title}</span>
                    {task.due_date && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(task.due_date, locale)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Active goals */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" aria-hidden="true" />
              {t("activeGoals")}
            </CardTitle>
            <Link href="/harmony/goals" className={linkClass}>
              {t("viewAll")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {activeGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGoals")}</p>
            ) : (
              <ul className="space-y-3">
                {activeGoals.map((g) => (
                  <li key={g.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{g.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {g.progress}%
                      </span>
                    </div>
                    <Progress value={g.progress} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Life Operator quick input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              {t("operator")}
            </CardTitle>
            <CardDescription>{t("operatorHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <OperatorQuickInput />
          </CardContent>
        </Card>

        {/* Life Advisor */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="size-4 text-primary" aria-hidden="true" />
              {t("advisor")}
            </CardTitle>
            <Link href="/harmony/advisor" className={linkClass}>
              {t("viewAll")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            <AdvisorPanel recommendations={recommendations} limit={3} />
          </CardContent>
        </Card>

        {/* Recent notes */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="size-4 text-primary" aria-hidden="true" />
              {t("recentNotes")}
            </CardTitle>
            <Link href="/harmony/notes" className={linkClass}>
              {t("viewAll")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noNotes")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recentNotes.map((n) => (
                  <div key={n.id} className="rounded-lg border p-3">
                    <p className="truncate text-sm font-medium">
                      {n.title || t("untitledNote")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {n.content || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
