import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listOpsEvents, type OpsEvent, type OpsLevel } from "@/lib/observability/ops";
import { resolveOpsEvent, resolveAllOpsEvents } from "@/lib/observability/ops-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { ActionButton } from "@/components/shared/action-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("operations");
  return { title: t("title") };
}

const LEVEL_VARIANT: Record<OpsLevel, "default" | "secondary" | "outline" | "destructive"> = {
  error: "destructive",
  warn: "default",
  info: "secondary",
};

function OpsRow({
  e,
  locale,
  detailLabel,
  resolveLabel,
  resolvedToast,
}: {
  e: OpsEvent;
  locale: string;
  detailLabel: string;
  resolveLabel: string;
  resolvedToast: string;
}) {
  const hasContext = e.context && Object.keys(e.context).length > 0;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={LEVEL_VARIANT[e.level]} className="uppercase">{e.level}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{e.source}</span>
            <span className="text-xs text-muted-foreground">· {formatDate(e.created_at, locale)}</span>
          </div>
          <p className="text-sm">{e.message}</p>
          {hasContext && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">{detailLabel}</summary>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
                {JSON.stringify(e.context, null, 2)}
              </pre>
            </details>
          )}
        </div>
        {!e.resolved && (
          <ActionButton
            action={resolveOpsEvent}
            fields={{ id: e.id }}
            size="sm"
            variant="outline"
            successMessage={resolvedToast}
          >
            {resolveLabel}
          </ActionButton>
        )}
      </CardContent>
    </Card>
  );
}

export default async function OperationsPage() {
  const t = await getTranslations("operations");
  const locale = await getLocale();
  const user = await requireUser();

  const events = await listOpsEvents(user.id, { limit: 100 });
  const unresolved = events.filter((e) => !e.resolved);
  const resolved = events.filter((e) => e.resolved).slice(0, 25);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        {unresolved.length > 0 && (
          <ActionButton
            action={resolveAllOpsEvents}
            size="sm"
            variant="outline"
            successMessage={t("resolvedAllToast")}
          >
            {t("resolveAll")}
          </ActionButton>
        )}
      </PageHeader>

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t("unresolved", { n: unresolved.length })}
          </h2>
          {unresolved.length === 0 ? (
            <InlineEmpty icon={CheckCircle2} message={t("allClear")} />
          ) : (
            <div className="flex flex-col gap-3">
              {unresolved.map((e) => (
                <OpsRow
                  key={e.id}
                  e={e}
                  locale={locale}
                  detailLabel={t("detail")}
                  resolveLabel={t("markResolved")}
                  resolvedToast={t("resolvedToast")}
                />
              ))}
            </div>
          )}
        </section>

        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t("recent")}
            </h2>
            <div className="flex flex-col gap-3 opacity-70">
              {resolved.map((e) => (
                <OpsRow
                  key={e.id}
                  e={e}
                  locale={locale}
                  detailLabel={t("detail")}
                  resolveLabel={t("markResolved")}
                  resolvedToast={t("resolvedToast")}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
