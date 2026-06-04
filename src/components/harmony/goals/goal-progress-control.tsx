"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { setGoalProgress } from "@/lib/harmony/goal-actions";

const STEP = 10;

/** Inline, optimistic goal progress stepper (reused on the card + detail view). */
export function GoalProgressControl({
  goalId,
  progress: initial,
}: {
  goalId: string;
  progress: number;
}) {
  const t = useTranslations("goals");
  const [progress, setOptimistic] = useOptimistic(initial);
  const [pending, start] = useTransition();

  function update(next: number) {
    const clamped = Math.min(100, Math.max(0, next));
    if (clamped === progress) return;
    const fd = new FormData();
    fd.set("id", goalId);
    fd.set("progress", String(clamped));
    start(async () => {
      setOptimistic(clamped);
      await setGoalProgress(fd);
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("progress")}</span>
        <span className="font-medium tabular-nums text-foreground">
          {progress}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => update(progress - STEP)}
          disabled={pending || progress <= 0}
          aria-label={t("decreaseProgress")}
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </Button>
        <Progress
          value={progress}
          className="flex-1"
          aria-label={`${t("progress")} ${progress}%`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => update(progress + STEP)}
          disabled={pending || progress >= 100}
          aria-label={t("increaseProgress")}
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
