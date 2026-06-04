"use client";

import { useLocale, useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GoalDialog } from "./goal-dialog";
import { ConfirmDeleteDialog } from "../confirm-delete-dialog";
import { deleteGoal } from "@/lib/harmony/goal-actions";
import { formatDate } from "@/lib/format";
import type { GoalStatus, PersonalGoal } from "@/types/database";

const statusVariant: Record<
  GoalStatus,
  "default" | "secondary" | "success" | "outline"
> = {
  active: "default",
  paused: "secondary",
  completed: "success",
  archived: "outline",
};

export function GoalCard({ goal }: { goal: PersonalGoal }) {
  const t = useTranslations("goals");
  const tc = useTranslations("common");
  const locale = useLocale();

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold leading-snug">{goal.title}</h3>
          <Badge variant={statusVariant[goal.status]}>
            {t(`status.${goal.status}`)}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <GoalDialog goal={goal}>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t("edit")}>
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          </GoalDialog>
          <ConfirmDeleteDialog action={deleteGoal} id={goal.id} itemTitle={goal.title}>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={tc("delete")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {goal.description && (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {goal.description}
          </p>
        )}
        <div className="mt-auto space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("progress")}</span>
            <span className="font-medium text-foreground">{goal.progress}%</span>
          </div>
          <Progress value={goal.progress} aria-label={`${t("progress")} ${goal.progress}%`} />
          {goal.target_date && (
            <p className="pt-1 text-xs text-muted-foreground">
              {t("target")}: {formatDate(goal.target_date, locale)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
