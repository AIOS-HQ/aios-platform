import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getGoal } from "@/lib/data/goals";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GoalDialog } from "@/components/harmony/goals/goal-dialog";
import { GoalProgressControl } from "@/components/harmony/goals/goal-progress-control";
import { formatDate } from "@/lib/format";
import type { GoalStatus } from "@/types/database";

const statusVariant: Record<
  GoalStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  active: "default",
  paused: "secondary",
  completed: "success",
  archived: "outline",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await requireUser();
  const goal = await getGoal(id);
  return { title: goal?.title ?? "Goal" };
}

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("goals");
  const locale = await getLocale();
  await requireUser();

  const goal = await getGoal(id);
  if (!goal) notFound();

  return (
    <>
      <Link
        href="/harmony/goals"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToGoals")}
      </Link>

      <PageHeader title={goal.title}>
        <GoalDialog goal={goal}>
          <Button variant="outline">
            <Pencil className="size-4" aria-hidden="true" />
            {t("edit")}
          </Button>
        </GoalDialog>
      </PageHeader>

      <div className="grid gap-6 lg:max-w-2xl">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("detail.overview")}</CardTitle>
            <Badge variant={statusVariant[goal.status]}>
              {t(`status.${goal.status}`)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {goal.description && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {goal.description}
              </p>
            )}
            <GoalProgressControl goalId={goal.id} progress={goal.progress} />
            {goal.target_date && (
              <p className="text-sm text-muted-foreground">
                {t("target")}: {formatDate(goal.target_date, locale)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
