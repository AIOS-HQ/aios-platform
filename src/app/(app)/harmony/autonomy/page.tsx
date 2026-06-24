import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { AIOS_WORKFORCE, getAiosAgent } from "@/lib/workforce/registry";
import {
  getAutonomyState,
  listAutonomyAudit,
  ACTION_CATEGORIES,
  isRestrictedCategory,
} from "@/lib/workforce/autonomy";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AutonomyControls } from "@/components/harmony/workforce/autonomy-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("autonomy");
  return { title: t("title") };
}

const DECISION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  auto_executed: "default",
  notified: "secondary",
  pending_approval: "outline",
  denied: "destructive",
  kill_switch: "destructive",
  lockdown: "destructive",
};

export default async function AutonomyPage() {
  const t = await getTranslations("autonomy");
  const locale = await getLocale();
  const user = await requireUser();
  const [state, audit] = await Promise.all([
    getAutonomyState(user.id),
    listAutonomyAudit(user.id, 100),
  ]);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const byDecision: Record<string, number> = {};
  const autoToday: Record<string, number> = {};
  let actionsToday = 0;
  for (const a of audit) {
    byDecision[a.decision] = (byDecision[a.decision] ?? 0) + 1;
    if ((a.decision === "auto_executed" || a.decision === "notified") && new Date(a.created_at) >= todayStart) {
      actionsToday += 1;
      autoToday[a.agent] = (autoToday[a.agent] ?? 0) + 1;
    }
  }

  const tiles: { label: string; value: string; danger?: boolean }[] = [
    { label: t("globalMode"), value: t(`modes.${state.global.mode}`) },
    { label: t("killSwitch"), value: state.global.kill_switch ? t("on") : t("off"), danger: state.global.kill_switch },
    { label: t("lockdown"), value: state.global.lockdown ? t("on") : t("off"), danger: state.global.lockdown },
    { label: t("actionsToday"), value: String(actionsToday) },
    { label: t("pendingApprovals"), value: String(byDecision["pending_approval"] ?? 0) },
    {
      label: t("denied"),
      value: String((byDecision["denied"] ?? 0) + (byDecision["kill_switch"] ?? 0) + (byDecision["lockdown"] ?? 0)),
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-8 lg:max-w-4xl">
        {/* ── Dashboard (Phase 10) ─────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="size-4" aria-hidden="true" />
            {t("dashboard")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => (
              <Card key={tile.label}>
                <CardContent className="p-4">
                  <p className={`text-xl font-bold ${tile.danger ? "text-destructive" : ""}`}>{tile.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tile.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-4">
              <ul className="flex flex-col gap-1.5 text-sm">
                {AIOS_WORKFORCE.map((a) => {
                  const s = state.agents[a.key];
                  const mode = s?.mode ?? "off";
                  return (
                    <li key={a.key} className="flex flex-wrap items-center gap-2">
                      <span className="w-28 font-medium">{a.name}</span>
                      <Badge
                        variant={mode === "bounded" ? "default" : mode === "advisory" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {t(`modes.${mode}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t("budgetBurn", { used: autoToday[a.key] ?? 0, limit: s?.daily_action_limit ?? 0 })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* ── Audit history ────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("auditHistory")}</h2>
          <Card>
            <CardContent className="p-4">
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noAudit")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {audit.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                      <Badge variant={DECISION_VARIANT[a.decision] ?? "outline"} className="text-[10px]">
                        {t(`decisions.${a.decision}`)}
                      </Badge>
                      <span className="font-medium">{getAiosAgent(a.agent)?.name ?? a.agent}</span>
                      {a.category ? (
                        <span className="text-xs text-muted-foreground">{t(`categories.${a.category}`)}</span>
                      ) : null}
                      {a.risk_level ? <Badge variant="outline" className="text-[10px]">{a.risk_level}</Badge> : null}
                      <span className="min-w-0 flex-1 truncate">{a.action}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.created_at, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── Controls (Phase 9) ───────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("controls")}</h2>
          <AutonomyControls
            global={{
              mode: state.global.mode,
              kill_switch: state.global.kill_switch,
              lockdown: state.global.lockdown,
              auto_execute_threshold: state.global.auto_execute_threshold,
              max_actions_per_hour: state.global.max_actions_per_hour,
              max_delegation_depth: state.global.max_delegation_depth,
              notify_on_medium: state.global.notify_on_medium,
            }}
            agents={AIOS_WORKFORCE.map((a) => {
              const s = state.agents[a.key];
              return {
                key: a.key,
                name: a.name,
                mode: s?.mode ?? "off",
                auto_execute_threshold: s?.auto_execute_threshold ?? "",
                daily_action_limit: s?.daily_action_limit ?? 0,
                monthly_action_limit: s?.monthly_action_limit ?? 0,
              };
            })}
            categories={ACTION_CATEGORIES.map((c) => {
              const p = state.categories[c];
              return {
                category: c,
                auto_allowed: p?.auto_allowed ?? false,
                requires_approval: p?.requires_approval ?? true,
                max_risk: p?.max_risk ?? "none",
                restricted: isRestrictedCategory(c),
              };
            })}
          />
        </section>
      </div>
    </>
  );
}
