import type { ComponentType, ReactNode } from "react";
import { Bot, Boxes, Building2, LayoutDashboard, Plug, Sparkles, Users, Workflow } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/lib/marketplace";

/**
 * A single Marketplace item card — the full item anatomy: icon, name,
 * description, included AI workers + connectors, deployment time, rating,
 * version, verification, dependencies, and an expandable preview (objectives,
 * change log, screenshots). The install/update/rollback (or deploy) control is
 * passed in as `action` so this stays a pure server component.
 */

export interface DisplayItem {
  id: string;
  icon: string;
  name: string;
  description: string;
  version: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  verification: VerificationStatus;
  workers: string[];
  connectors: string[];
  dependencies: string[];
  deploymentMinutes: number;
  changelog: string[];
  objectives?: string[];
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Building2,
  Users,
  Bot,
  Sparkles,
  Plug,
  Workflow,
  LayoutDashboard,
  Boxes,
};

const VERIFICATION_VARIANT: Record<VerificationStatus, "default" | "secondary" | "outline" | "destructive"> = {
  verified: "default",
  pending: "secondary",
  unverified: "outline",
  rejected: "destructive",
};

function Chips({ items, max = 4 }: { items: string[]; max?: number }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((it) => (
        <span key={it} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {it}
        </span>
      ))}
      {extra > 0 ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">+{extra}</span> : null}
    </div>
  );
}

export async function MarketplaceItemCard({ item, action }: { item: DisplayItem; action: ReactNode }) {
  const t = await getTranslations("marketplace");
  const Icon = ICONS[item.icon] ?? Sparkles;

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-base font-semibold">{item.name}</p>
              <Badge variant={VERIFICATION_VARIANT[item.verification]} className="shrink-0 text-[10px]">
                {t(`verification.${item.verification}`)}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          </div>
        </div>

        {/* Meta row: rating · version · deployment time */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("labels.rating")}:{" "}
            <span className="font-medium text-foreground">
              {item.ratingAvg != null ? `${item.ratingAvg}★ (${item.ratingCount})` : t("labels.unrated")}
            </span>
          </span>
          {item.version ? (
            <span>
              {t("labels.version")} <span className="font-medium text-foreground">v{item.version}</span>
            </span>
          ) : null}
          <span>
            {t("labels.deploymentTime")}: {t("labels.estMinutes", { n: item.deploymentMinutes })}
          </span>
        </div>

        {/* Included workers + connectors */}
        {item.workers.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{t("labels.workers")}</span>
            <Chips items={item.workers} />
          </div>
        ) : null}
        {item.connectors.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{t("labels.connectors")}</span>
            <Chips items={item.connectors} />
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{t("labels.dependencies")}: </span>
          {item.dependencies.length > 0 ? item.dependencies.join(", ") : t("labels.none")}
        </div>

        {/* Expandable preview: objectives, change log, screenshots */}
        <details className="group rounded-lg border bg-muted/30 [&>summary]:list-none">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            {t("labels.details")}
          </summary>
          <div className="flex flex-col gap-2 px-3 pb-3 text-xs text-muted-foreground">
            {item.objectives && item.objectives.length > 0 ? (
              <div>
                <p className="font-medium text-foreground/80">{t("labels.objectives")}</p>
                <ul className="mt-1 list-disc pl-4">
                  {item.objectives.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="font-medium text-foreground/80">{t("labels.changelog")}</p>
              <ul className="mt-1 list-disc pl-4">
                {item.changelog.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground/80">{t("labels.screenshots")}</p>
              <div className="mt-1 flex gap-2">
                <div className="h-14 w-24 rounded-md border border-dashed bg-background" />
                <div className="h-14 w-24 rounded-md border border-dashed bg-background" />
              </div>
              <p className="mt-1">{t("screenshotsPlaceholder")}</p>
            </div>
          </div>
        </details>

        <div className="mt-auto pt-1">{action}</div>
      </CardContent>
    </Card>
  );
}
