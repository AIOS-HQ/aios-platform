import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneStyles: Record<Tone, string> = {
  neutral: "border-border bg-muted/40 text-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/25 bg-primary/10 text-primary",
};

export function ExecutiveSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-soft">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            {description && (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex min-h-28 flex-col justify-between gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {Icon && (
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border",
                toneStyles[tone],
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div
            className={cn(
              "min-w-0 break-words text-2xl font-semibold tracking-tight",
              valueClassName,
            )}
          >
            {value}
          </div>
          {detail && (
            <div className="text-xs leading-5 text-muted-foreground">
              {detail}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SignalPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function ExecutiveList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y rounded-xl border bg-card shadow-soft", className)}>
      {children}
    </div>
  );
}
