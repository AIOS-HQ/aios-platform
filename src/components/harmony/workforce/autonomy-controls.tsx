"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  updateGlobalAutonomy,
  updateAgentAutonomy,
  updateCategoryPolicy,
  runAutonomyPass,
  applyTierDefaults,
} from "@/lib/workforce/autonomy-actions";
import { tierOf } from "@/lib/workforce/autonomy-tiers";
import { idleState } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export interface GlobalView {
  mode: string;
  kill_switch: boolean;
  lockdown: boolean;
  auto_execute_threshold: string;
  max_actions_per_hour: number;
  max_delegation_depth: number;
  notify_on_medium: boolean;
}
export interface AgentView {
  key: string;
  name: string;
  mode: string;
  auto_execute_threshold: string;
  daily_action_limit: number;
  monthly_action_limit: number;
}
export interface CategoryView {
  category: string;
  auto_allowed: boolean;
  requires_approval: boolean;
  max_risk: string;
  restricted: boolean;
}

const SELECT = "h-9 rounded-md border bg-background px-2 text-sm";

export function AutonomyControls({
  global,
  agents,
  categories,
}: {
  global: GlobalView;
  agents: AgentView[];
  categories: CategoryView[];
}) {
  const t = useTranslations("autonomy");
  const router = useRouter();
  const [gState, gAction] = useActionState(updateGlobalAutonomy, idleState);
  const [aState, aAction] = useActionState(updateAgentAutonomy, idleState);
  const [cState, cAction] = useActionState(updateCategoryPolicy, idleState);
  const [pState, pAction] = useActionState(runAutonomyPass, idleState);
  const [tState, tAction] = useActionState(applyTierDefaults, idleState);

  useEffect(() => {
    if ([gState, aState, cState, pState, tState].some((s) => s.status === "success")) router.refresh();
  }, [gState, aState, cState, pState, tState, router]);

  return (
    <div className="flex flex-col gap-6">
      {/* Apply tier defaults */}
      <form action={tAction} className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <p className="text-sm text-muted-foreground">{t("applyTierHint")}</p>
        <SubmitButton size="sm" variant="outline">{t("applyTier")}</SubmitButton>
      </form>
      <FormMessage state={tState} />

      {/* Run pass */}
      <form action={pAction} className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <p className="text-sm text-muted-foreground">{t("runPassHint")}</p>
        <SubmitButton size="sm" variant="outline">{t("runPass")}</SubmitButton>
      </form>
      <FormMessage state={pState} />

      {/* Global controls */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("globalControls")}</h3>
        <form action={gAction} className="flex flex-col gap-3 rounded-lg border p-4">
          <FormMessage state={gState} />
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("mode")}
            <select name="mode" defaultValue={global.mode} className={SELECT}>
              <option value="off">{t("modes.off")}</option>
              <option value="advisory">{t("modes.advisory")}</option>
              <option value="bounded">{t("modes.bounded")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("autoThreshold")}
            <select name="auto_execute_threshold" defaultValue={global.auto_execute_threshold} className={SELECT}>
              <option value="none">{t("thresholds.none")}</option>
              <option value="low">{t("thresholds.low")}</option>
              <option value="medium">{t("thresholds.medium")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("maxActionsPerHour")}
            <input type="number" name="max_actions_per_hour" min={0} defaultValue={global.max_actions_per_hour} className={`${SELECT} w-24`} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("maxDelegationDepth")}
            <input type="number" name="max_delegation_depth" min={0} defaultValue={global.max_delegation_depth} className={`${SELECT} w-24`} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify_on_medium" defaultChecked={global.notify_on_medium} />
            {t("notifyOnMedium")}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-destructive">
            <input type="checkbox" name="kill_switch" defaultChecked={global.kill_switch} />
            {t("killSwitch")}
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-destructive">
            <input type="checkbox" name="lockdown" defaultChecked={global.lockdown} />
            {t("lockdown")}
          </label>
          <div className="flex justify-end">
            <SubmitButton size="sm">{t("save")}</SubmitButton>
          </div>
        </form>
      </section>

      {/* Per-agent controls */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("perAgentControls")}</h3>
        <div className="flex flex-col gap-2">
          {agents.map((a) => (
            <form key={a.key} action={aAction} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <input type="hidden" name="agent" value={a.key} />
              <span className="w-28 shrink-0 text-sm font-medium">{a.name}</span>
              <Badge variant="outline" className="text-[10px]">{t("tier", { n: tierOf(a.key) })}</Badge>
              <select name="mode" defaultValue={a.mode} aria-label={t("mode")} className={SELECT}>
                <option value="off">{t("modes.off")}</option>
                <option value="advisory">{t("modes.advisory")}</option>
                <option value="bounded">{t("modes.bounded")}</option>
              </select>
              <select name="auto_execute_threshold" defaultValue={a.auto_execute_threshold} aria-label={t("autoThreshold")} className={SELECT}>
                <option value="">{t("inherit")}</option>
                <option value="none">{t("thresholds.none")}</option>
                <option value="low">{t("thresholds.low")}</option>
                <option value="medium">{t("thresholds.medium")}</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                {t("daily")}
                <input type="number" name="daily_action_limit" min={0} defaultValue={a.daily_action_limit} className={`${SELECT} w-20`} />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                {t("monthly")}
                <input type="number" name="monthly_action_limit" min={0} defaultValue={a.monthly_action_limit} className={`${SELECT} w-20`} />
              </label>
              <SubmitButton size="sm" variant="outline" className="ml-auto h-8 px-2 text-xs">{t("save")}</SubmitButton>
            </form>
          ))}
          <FormMessage state={aState} />
        </div>
      </section>

      {/* Category policy */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("categoryControls")}</h3>
        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <form key={c.category} action={cAction} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <input type="hidden" name="category" value={c.category} />
              <span className="w-32 shrink-0 text-sm font-medium">{t(`categories.${c.category}`)}</span>
              {c.restricted ? (
                <Badge variant="secondary" className="text-[10px]">{t("approvalOnly")}</Badge>
              ) : (
                <>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="auto_allowed" defaultChecked={c.auto_allowed} />
                    {t("autoAllowed")}
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="requires_approval" defaultChecked={c.requires_approval} />
                    {t("requiresApproval")}
                  </label>
                  <select name="max_risk" defaultValue={c.max_risk} aria-label={t("maxRisk")} className={SELECT}>
                    <option value="none">{t("thresholds.none")}</option>
                    <option value="low">{t("thresholds.low")}</option>
                    <option value="medium">{t("thresholds.medium")}</option>
                  </select>
                  <SubmitButton size="sm" variant="outline" className="ml-auto h-8 px-2 text-xs">{t("save")}</SubmitButton>
                </>
              )}
            </form>
          ))}
          <FormMessage state={cState} />
        </div>
      </section>
    </div>
  );
}
