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
import { AgentGlyph } from "@/components/harmony/workforce/agent-glyph";
import {
  ExecutiveList,
  ExecutiveSection,
  MetricTile,
} from "@/components/shared/executive";

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

  const tiles = [
    { label: t("globalMode"), value: t(`modes.${state.global.mode}`), tone: "info" as const },
    { label: t("killSwitch"), value: state.global.kill_switch ? t("on") : t("off"), tone: state.global.kill_switch ? "danger" as const : "success" as const },
    { label: t("lockdown"), value: state.global.lockdown ? t("on") : t("off"), tone: state.global.lockdown ? "danger" as const : "success" as const },
    { label: t("actionsToday"), value: String(actionsToday), tone: "neutral" as const },
    { label: t("pendingApprovals"), value: String(byDecision["pending_approval"] ?? 0), tone: (byDecision["pending_approval"] ?? 0) > 0 ? "warning" as const : "neutral" as const },
    {
      label: t("denied"),
      value: String((byDecision["denied"] ?? 0) + (byDecision["kill_switch"] ?? 0) + (byDecision["lockdown"] ?? 0)),
      tone:
        (byDecision["denied"] ?? 0) + (byDecision["kill_switch"] ?? 0) + (byDecision["lockdown"] ?? 0) > 0
          ? "danger" as const
          : "neutral" as const,
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-8">
        {/* ── Dashboard (Phase 10) ─────────────────────────────────────── */}
        <ExecutiveSection icon={Activity} title={t("dashboard")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile) => (
              <MetricTile
                key={tile.label}
                label={tile.label}
                value={tile.value}
                icon={Activity}
                tone={tile.tone}
                valueClassName="text-xl"
              />
            ))}
          </div>
          <Card>
            <CardContent className="p-5">
              <ExecutiveList>
                {AIOS_WORKFORCE.map((a) => {
                  const s = state.agents[a.key];
                  const mode = s?.mode ?? "off";
                  return (
                    <li key={a.key} className="flex flex-wrap items-center gap-3 p-4">
                      <AgentGlyph agent={a.key} size="xs" />
                      <span className="w-28 font-semibold">{a.name}</span>
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
              </ExecutiveList>
            </CardContent>
          </Card>
        </ExecutiveSection>

        {/* ── Audit history ────────────────────────────────────────────── */}
        <ExecutiveSection icon={Activity} title={t("auditHistory")}>
          <Card>
            <CardContent className="p-5">
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noAudit")}</p>
              ) : (
                <ExecutiveList>
                  {audit.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 p-4 text-sm">
                      <Badge variant={DECISION_VARIANT[a.decision] ?? "outline"} className="text-[10px]">
                        {t(`decisions.${a.decision}`)}
                      </Badge>
                      <AgentGlyph agent={a.agent} size="xs" />
                      <span className="font-medium">{getAiosAgent(a.agent)?.name ?? a.agent}</span>
                      {a.category ? (
                        <span className="text-xs text-muted-foreground">{t(`categories.${a.category}`)}</span>
                      ) : null}
                      {a.risk_level ? <Badge variant="outline" className="text-[10px]">{a.risk_level}</Badge> : null}
                      <span className="min-w-0 flex-1 truncate">{a.action}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.created_at, locale)}</span>
                    </li>
                  ))}
                </ExecutiveList>
              )}
            </CardContent>
          </Card>
        </ExecutiveSection>

        {/* ── Controls (Phase 9) ───────────────────────────────────────── */}
        <ExecutiveSection icon={Activity} title={t("controls")}>
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
        </ExecutiveSection>
      </div>
    </>
  );
}
