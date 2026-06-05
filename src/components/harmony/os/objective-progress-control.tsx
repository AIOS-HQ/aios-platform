"use client";

import { useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { setObjectiveProgress } from "@/lib/harmony/os/objective-actions";

/** Inline progress stepper (±10%) for an objective. */
export function ObjectiveProgressControl({
  objectiveId,
  progress,
}: {
  objectiveId: string;
  progress: number;
}) {
  const t = useTranslations("os.objectives");
  const [pending, start] = useTransition();

  function step(delta: number) {
    const next = Math.min(100, Math.max(0, progress + delta));
    if (next === progress) return;
    start(async () => {
      await setObjectiveProgress(objectiveId, next);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t("progress")}</span>
        <span className="text-sm font-medium tabular-nums">{progress}%</span>
      </div>
      <Progress value={progress} />
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => step(-10)}
          disabled={pending || progress <= 0}
          aria-label={t("decrease")}
        >
          <Minus className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => step(10)}
          disabled={pending || progress >= 100}
          aria-label={t("increase")}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
