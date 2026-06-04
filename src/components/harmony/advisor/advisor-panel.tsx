import { getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdvisorRecommendation, AdvisorTone } from "@/lib/harmony/advisor";

const toneClass: Record<AdvisorTone, string> = {
  info: "border-primary/20 bg-primary/5 text-foreground",
  warning: "border-warning/30 bg-warning/10 text-foreground",
  success: "border-success/30 bg-success/10 text-foreground",
};

const toneIcon = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
} as const;

const toneIconColor: Record<AdvisorTone, string> = {
  info: "text-primary",
  warning: "text-warning",
  success: "text-success",
};

export async function AdvisorPanel({
  recommendations,
  limit,
}: {
  recommendations: AdvisorRecommendation[];
  limit?: number;
}) {
  const t = await getTranslations("advisor");
  const items =
    typeof limit === "number" ? recommendations.slice(0, limit) : recommendations;

  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const Icon = toneIcon[r.tone];
        return (
          <li
            key={r.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-sm",
              toneClass[r.tone],
            )}
          >
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", toneIconColor[r.tone])}
              aria-hidden="true"
            />
            <span>{t(`rec.${r.key}`, r.values ?? {})}</span>
          </li>
        );
      })}
    </ul>
  );
}
