import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  nextOnboardingStep,
  onboardingProgress,
  type OnboardingStep,
  type OnboardingStepKey,
} from "@/lib/harmony/os/onboarding";

/**
 * Founder OS first-run checklist. Presentational — `steps` are derived from real
 * platform state by the caller, so the list always reflects current progress and
 * disappears once every step is done.
 */
export async function FirstRunChecklist({
  steps,
  firstDepartmentId,
}: {
  steps: OnboardingStep[];
  firstDepartmentId?: string;
}) {
  const t = await getTranslations("os.onboarding");
  const { done, total, percent } = onboardingProgress(steps);
  const next = nextOnboardingStep(steps);

  const hrefFor = (key: OnboardingStepKey): string => {
    switch (key) {
      case "hasCompany":
      case "hasDepartment":
        return "/harmony/companies";
      case "autonomyConfigured":
        return firstDepartmentId
          ? `/harmony/departments/${firstDepartmentId}`
          : "/harmony/companies";
      case "hasObjective":
        return "/harmony/objectives";
      case "hasWork":
        return "/harmony/work";
      case "approvalReviewed":
        return "/harmony/approvals";
    }
  };

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          {t("title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { done, total })}
        </p>
        <Progress value={percent} className="mt-2" />
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {steps.map((s) => {
            const isNext = next?.key === s.key;
            return (
              <li key={s.key} className="flex items-center gap-3 py-1">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    s.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40 text-transparent",
                  )}
                >
                  <Check className="size-3" aria-hidden="true" />
                </span>
                <span
                  className={cn(
                    "flex-1 text-sm",
                    s.done && "text-muted-foreground line-through",
                  )}
                >
                  {t(`steps.${s.key}`)}
                </span>
                {!s.done &&
                  (isNext ? (
                    <Button asChild size="sm">
                      <Link href={hrefFor(s.key)}>
                        {t("start")}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <Link
                      href={hrefFor(s.key)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`${t("start")}: ${t(`steps.${s.key}`)}`}
                    >
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  ))}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
