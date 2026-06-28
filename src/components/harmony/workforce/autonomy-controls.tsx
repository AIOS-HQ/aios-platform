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
const HELP_ICON =
  "inline-flex size-4 items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground";

function Help({ text }: { text: string }) {
  return (
    <span className={HELP_ICON} title={text} aria-label={text}>
      ?
    </span>
  );
}

function LabelText({ label, help }: { label: string; help: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <Help text={help} />
    </span>
  );
}

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
            <LabelText label={t("mode")} help={t("help.mode")} />
            <select name="mode" defaultValue={global.mode} className={SELECT}>
              <option value="off">{t("modes.off")}</option>
              <option value="advisory">{t("modes.advisory")}</option>
              <option value="bounded">{t("modes.bounded")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <LabelText label={t("autoThreshold")} help={t("help.autoThreshold")} />
            <select name="auto_execute_threshold" defaultValue={global.auto_execute_threshold} className={SELECT}>
              <option value="none">{t("thresholds.none")}</option>
              <option value="low">{t("thresholds.low")}</option>
              <option value="medium">{t("thresholds.medium")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <LabelText label={t("maxActionsPerHour")} help={t("help.maxActionsPerHour")} />
            <input type="number" name="max_actions_per_hour" min={0} defaultValue={global.max_actions_per_hour} className={`${SELECT} w-24`} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <LabelText label={t("maxDelegationDepth")} help={t("help.maxDelegationDepth")} />
            <input type="number" name="max_delegation_depth" min={0} defaultValue={global.max_delegation_depth} className={`${SELECT} w-24`} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify_on_medium" defaultChecked={global.notify_on_medium} />
            <LabelText label={t("notifyOnMedium")} help={t("help.notifyOnMedium")} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-destructive">
            <input type="checkbox" name="kill_switch" defaultChecked={global.kill_switch} />
            <LabelText label={t("killSwitch")} help={t("help.killSwitch")} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-destructive">
            <input type="checkbox" name="lockdown" defaultChecked={global.lockdown} />
            <LabelText label={t("lockdown")} help={t("help.lockdown")} />
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
              <select name="mode" defaultValue={a.mode} aria-label={t("mode")} title={t("help.mode")} className={SELECT}>
                <option value="off">{t("modes.off")}</option>
                <option value="advisory">{t("modes.advisory")}</option>
                <option value="bounded">{t("modes.bounded")}</option>
              </select>
              <select name="auto_execute_threshold" defaultValue={a.auto_execute_threshold} aria-label={t("autoThreshold")} title={t("help.agentThreshold")} className={SELECT}>
                <option value="">{t("inherit")}</option>
                <option value="none">{t("thresholds.none")}</option>
                <option value="low">{t("thresholds.low")}</option>
                <option value="medium">{t("thresholds.medium")}</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <LabelText label={t("daily")} help={t("help.daily")} />
                <input type="number" name="daily_action_limit" min={0} defaultValue={a.daily_action_limit} className={`${SELECT} w-20`} />
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <LabelText label={t("monthly")} help={t("help.monthly")} />
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
                <Badge variant="secondary" className="text-[10px]" title={t("help.approvalOnly")}>{t("approvalOnly")}</Badge>
              ) : (
                <>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="auto_allowed" defaultChecked={c.auto_allowed} />
                    <LabelText label={t("autoAllowed")} help={t("help.autoAllowed")} />
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="requires_approval" defaultChecked={c.requires_approval} />
                    <LabelText label={t("requiresApproval")} help={t("help.requiresApproval")} />
                  </label>
                  <select name="max_risk" defaultValue={c.max_risk} aria-label={t("maxRisk")} title={t("help.maxRisk")} className={SELECT}>
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
