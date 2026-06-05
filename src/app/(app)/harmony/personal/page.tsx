import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Lightbulb,
  ListTodo,
  Sparkles,
  StickyNote,
  Target,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getProfile, getUserSettings } from "@/lib/data/profile";
import { listTasks, todayTasks } from "@/lib/data/tasks";
import { listGoals } from "@/lib/data/goals";
import { listNotes } from "@/lib/data/notes";
import { buildRecommendations } from "@/lib/harmony/advisor";
import { timeOfDay } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  StatTiles,
  type Stat,
} from "@/components/harmony/dashboard/stat-tiles";
import { TodayTaskRow } from "@/components/harmony/dashboard/today-task-row";
import { QuickAddTask } from "@/components/harmony/dashboard/quick-add-task";
import { AdvisorPanel } from "@/components/harmony/advisor/advisor-panel";
import { OperatorQuickInput } from "@/components/harmony/operator/operator-quick-input";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const user = await requireUser();
  const [profile, settings, tasks, goals, notes] = await Promise.all([
    getProfile(user.id),
    getUserSettings(user.id),
    listTasks(),
    listGoals(),
    listNotes(),
  ]);

  const name = profile?.full_name?.trim() || user.email?.split("@")[0] || "";
  const greeting = t(`greeting.${timeOfDay(settings?.timezone ?? "UTC")}`, {
    name,
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const openTasks = tasks.filter((x) => x.status !== "done");
  const dueTodayCount = openTasks.filter((x) => x.due_date === todayStr).length;
  const overdueCount = openTasks.filter(
    (x) => x.due_date && x.due_date < todayStr,
  ).length;
  const activeGoalsAll = goals.filter((g) => g.status === "active");

  const today = todayTasks(tasks).slice(0, 6);
  const activeGoals = activeGoalsAll.slice(0, 3);
  const recentNotes = notes.slice(0, 4);
  const recommendations = buildRecommendations({ tasks, goals, notes });
  const isNew =
    tasks.length === 0 && goals.length === 0 && notes.length === 0;

  const stats: Stat[] = [
    { key: "open", label: t("stats.openTasks"), value: openTasks.length, icon: ListTodo, href: "/harmony/tasks" },
    { key: "today", label: t("stats.dueToday"), value: dueTodayCount, icon: CalendarClock, href: "/harmony/tasks" },
    { key: "overdue", label: t("stats.overdue"), value: overdueCount, icon: AlertTriangle, href: "/harmony/tasks", emphasis: true },
    { key: "goals", label: t("stats.activeGoals"), value: activeGoalsAll.length, icon: Target, href: "/harmony/goals" },
    { key: "notes", label: t("stats.notes"), value: notes.length, icon: StickyNote, href: "/harmony/notes" },
  ];

  const linkClass =
    "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline";

  return (
    <>
      <PageHeader title={greeting} description={t("subtitle")} />

      <StatTiles stats={stats} />

      {isNew && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">{t("onboarding.title")}</CardTitle>
            <CardDescription>{t("onboarding.body")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/harmony/tasks">{t("onboarding.task")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/harmony/goals">{t("onboarding.goal")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/harmony/notes">{t("onboarding.note")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

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
          <CardContent className="space-y-4">
            {today.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noTasksToday")}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {today.map((task) => (
                  <TodayTaskRow key={task.id} task={task} />
                ))}
              </ul>
            )}
            <QuickAddTask />
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
