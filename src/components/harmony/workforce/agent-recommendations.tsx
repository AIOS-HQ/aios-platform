"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { recommendationAction } from "@/lib/workforce/recommendations-actions";
import { idleState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export interface RecommendationView {
  id: string;
  agent: string;
  agentName: string;
  title: string;
  detail: string | null;
  rationale: string | null;
  status: string;
}

/**
 * Agent recommendations list with founder accept / dismiss controls. Shows the
 * source agent (optional) and rationale. Advisory — records the decision only.
 */
export function AgentRecommendations({
  recommendations,
  showAgent = false,
}: {
  recommendations: RecommendationView[];
  showAgent?: boolean;
}) {
  const t = useTranslations("workforce");
  const [state, action] = useActionState(recommendationAction, idleState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  if (recommendations.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noRecommendations")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <FormMessage state={state} />
      <ul className="flex flex-col gap-2">
        {recommendations.map((r) => (
          <li key={r.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              {showAgent ? (
                <Badge variant="secondary" className="text-[10px]">{r.agentName}</Badge>
              ) : null}
              <span className="text-sm font-medium">{r.title}</span>
              <span className="ml-auto flex gap-1.5">
                <form action={action}>
                  <input type="hidden" name="op" value="accept" />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="agent" value={r.agent} />
                  <SubmitButton size="sm" className="h-7 px-2 text-xs">
                    {t("recommendationOp.accept")}
                  </SubmitButton>
                </form>
                <form action={action}>
                  <input type="hidden" name="op" value="dismiss" />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="agent" value={r.agent} />
                  <SubmitButton variant="outline" size="sm" className="h-7 px-2 text-xs">
                    {t("recommendationOp.dismiss")}
                  </SubmitButton>
                </form>
              </span>
            </div>
            {r.detail ? (
              <p className="mt-1 text-sm text-muted-foreground">{r.detail}</p>
            ) : null}
            {r.rationale ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium">{t("rationale")}:</span> {r.rationale}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
