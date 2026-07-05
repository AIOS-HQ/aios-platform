"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  installMarketplaceItem,
  updateMarketplaceItem,
  rollbackMarketplaceItem,
  uninstallMarketplaceItem,
} from "@/lib/marketplace/actions";
import type { ApplyResult } from "@/lib/marketplace/actions";

/**
 * Client controls for a marketplace item's install lifecycle. Buttons call the
 * server actions (which plan via the engine, then write owner-scoped rows) and
 * surface the returned plan — blocked reasons or applied — inline. Disabled when
 * no company is selected. Purely presentational wiring; the engine + RLS enforce
 * correctness server-side.
 */
export function MarketplaceActions({
  companyId,
  itemId,
  installed,
  rollbackVersion,
}: {
  companyId: string | null;
  itemId: string;
  installed: boolean;
  /** A prior version to offer rollback to, when known. */
  rollbackVersion?: string | null;
}) {
  const t = useTranslations("marketplace");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ApplyResult | null>(null);

  function run(fn: () => Promise<ApplyResult>) {
    if (!companyId || pending) return;
    setResult(null);
    start(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult(null);
      }
    });
  }

  if (!companyId) {
    return <p className="text-xs text-muted-foreground">{t("actions.selectCompany")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {!installed ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => installMarketplaceItem(companyId, itemId))}>
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
            {t("actions.install")}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateMarketplaceItem(companyId, itemId))}>
              <ArrowRight className="size-3.5" aria-hidden="true" />
              {t("actions.update")}
            </Button>
            {rollbackVersion ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => rollbackMarketplaceItem(companyId, itemId, rollbackVersion))}>
                {t("actions.rollback")}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => uninstallMarketplaceItem(companyId, itemId))}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              {t("actions.uninstall")}
            </Button>
          </>
        )}
      </div>

      {result ? (
        result.applied ? (
          <p className="flex items-center gap-1 text-xs text-success">
            <Check className="size-3.5" aria-hidden="true" /> {t("actions.applied")}
          </p>
        ) : result.plan.blocked ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <p className="flex items-center gap-1 font-medium">
              <X className="size-3.5" aria-hidden="true" /> {t("actions.blocked")}
            </p>
            <ul className="mt-1 list-disc pl-4">
              {result.plan.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("actions.failed")}</p>
        )
      ) : null}
    </div>
  );
}
