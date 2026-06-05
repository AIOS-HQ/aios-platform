import { getTranslations } from "next-intl/server";
import { AUTONOMY_LEVELS, autonomyCostTier } from "@/lib/harmony/os/autonomy";
import { cn } from "@/lib/utils";

type Risk = "low" | "medium" | "high";

/** Risk framing per level (rises with autonomy). */
const RISK: Record<string, Risk> = {
  manual: "low",
  assisted: "low",
  supervised: "low",
  autonomous: "medium",
  executive: "high",
};

const riskClass: Record<Risk, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  high: "bg-destructive/10 text-destructive",
};

/**
 * Collapsible legend explaining the autonomy levels — who approves, what runs
 * automatically, and the risk at each level. Uses the shipped cost tiers so it
 * stays consistent with the autonomy selector. Native <details> = no client JS,
 * keyboard-accessible by default.
 */
export async function AutonomyLegend() {
  const ta = await getTranslations("os.autonomy");
  const th = await getTranslations("os.departments");

  return (
    <details className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {th("legendTitle")}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">{th("legendHint")}</p>
      <ul className="mt-3 space-y-3">
        {AUTONOMY_LEVELS.map((l) => {
          const tier = autonomyCostTier(l.level);
          const risk = RISK[l.key];
          return (
            <li key={l.level} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold tabular-nums">
                {l.level}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{ta(l.key)}</span>
                  {tier && (
                    <span className="text-xs text-muted-foreground">{tier}</span>
                  )}
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      riskClass[risk],
                    )}
                  >
                    {th(`risk.${risk}`)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {th(`autonomyHint.${l.key}`)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
