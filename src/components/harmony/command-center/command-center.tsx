import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import { runAudit, type Severity } from "@/lib/agents/auditor/service";
import { getJuliusAwareness } from "@/lib/julius/wiring";
import { listJuliusEntries } from "@/lib/julius/service";
import { AIOS_WORKFORCE } from "@/lib/workforce/registry";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SEV_VARIANT: Record<Severity, "default" | "secondary" | "outline" | "destructive"> = {
  ok: "secondary",
  info: "outline",
  warn: "default",
  risk: "destructive",
};

export interface CommandCenterProps {
  userId: string;
  companyId: string | null;
  objectives: { id: string; title: string }[];
  pendingApprovals: number;
  activity: { id: string; summary: string; created_at: string }[];
  objectivesTotal: number;
  workTotal: number;
  decidedApprovals: number;
  blockedWork: number;
}

type Rec = { priority: "founder" | "risk" | "improve" | "execution"; text: string };

/**
 * Founder Command Center sections — the primary operational cockpit, rendered
 * inside /harmony. Reuses the Auditor (risk) and Julius (awareness) engines.
 * Owner-scoped; Julius-backed sections are scoped to the primary company.
 */
export async function CommandCenter(props: CommandCenterProps) {
  const t = await getTranslations("commandCenter");
  const locale = await getLocale();
  // Freshness stamp for cockpit sections — this view recomputes on every load,
  // so "as of" reflects the moment the Auditor/attention data was generated.
  const generatedAt = formatDateTime(new Date().toISOString(), locale);

  const report = await runAudit(props.userId);
  const awareness = props.companyId
    ? await getJuliusAwareness(props.userId, props.companyId)
    : { objectives: [], decisions: [], activities: [], knowledge: [], total: 0 };
  const juliusEntries = props.companyId
    ? await listJuliusEntries(props.userId, props.companyId, { limit: 200 })
    : [];

  const activeFindings = report.findings.filter(
    (f) => f.severity === "risk" || f.severity === "warn",
  );
  const governanceFindings = report.findings.filter((f) => f.domain === "governance");
  const deploymentFindings = report.findings.filter((f) => f.domain === "deployment");

  // Strategic recommendations from real Auditor + OS signals (prioritized).
  const recs: Rec[] = [];
  if (props.pendingApprovals > 0)
    recs.push({ priority: "founder", text: t("rec.approvals", { n: props.pendingApprovals }) });
  for (const f of report.findings.filter((f) => f.severity === "risk"))
    recs.push({ priority: "risk", text: f.detail });
  for (const f of report.findings.filter((f) => f.severity === "warn").slice(0, 3))
    recs.push({ priority: "improve", text: f.detail });
  if (props.objectivesTotal === 0)
    recs.push({ priority: "execution", text: t("rec.firstObjective") });
  if (recs.length === 0) recs.push({ priority: "improve", text: t("rec.allClear") });

  const recVariant: Record<Rec["priority"], "default" | "secondary" | "outline" | "destructive"> = {
    founder: "default",
    risk: "destructive",
    improve: "outline",
    execution: "secondary",
  };

  // Agent health: real per-agent Julius contributions; Auditor shows live posture.
  const contribByAgent = new Map<string, number>();
  for (const e of juliusEntries)
    contribByAgent.set(e.agent, (contribByAgent.get(e.agent) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Needs Your Attention (leads the cockpit) ────────────────────── */}
      {(() => {
        const riskFindings = report.findings.filter((f) => f.severity === "risk");
        const warnFindings = report.findings.filter((f) => f.severity === "warn");
        const hasAttention =
          props.pendingApprovals > 0 ||
          props.blockedWork > 0 ||
          riskFindings.length > 0 ||
          warnFindings.length > 0;
        return (
          <Card className={hasAttention ? "border-destructive/40" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
                {t("needsAttention")}
              </CardTitle>
              <CardDescription>{t("needsAttentionHint")}</CardDescription>
              <p className="text-xs text-muted-foreground">
                {t("asOf", { time: generatedAt })}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {!hasAttention ? (
                <p className="text-sm text-muted-foreground">{t("allClear")}</p>
              ) : (
                <ul className="space-y-2">
                  {props.pendingApprovals > 0 && (
                    <li className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <Badge variant="default">{t("attnAction")}</Badge>
                        {t("approvalsNeed", { n: props.pendingApprovals })}
                      </span>
                      <Button asChild size="sm">
                        <Link href="/harmony/approvals">{t("reviewApprovals")}</Link>
                      </Button>
                    </li>
                  )}
                  {props.blockedWork > 0 && (
                    <li className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <Badge variant="default">{t("attnStalled")}</Badge>
                        {t("stalledWork", { n: props.blockedWork })}
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/harmony/work">{t("viewWork")}</Link>
                      </Button>
                    </li>
                  )}
                  {riskFindings.map((f, i) => (
                    <li key={`r${i}`} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-start gap-2 text-sm">
                        <Badge variant="destructive" className="mt-0.5 shrink-0">
                          {t("sevName.risk")}
                        </Badge>
                        <span className="text-muted-foreground">{f.detail}</span>
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/settings/auditor">{t("investigate")}</Link>
                      </Button>
                    </li>
                  ))}
                  {warnFindings.slice(0, 3).map((f, i) => (
                    <li key={`w${i}`} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-start gap-2 text-sm">
                        <Badge variant="default" className="mt-0.5 shrink-0">
                          {t("sevName.warn")}
                        </Badge>
                        <span className="text-muted-foreground">{f.detail}</span>
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/settings/auditor">{t("investigate")}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Risk Overview (Auditor) ───────────────────────────────────── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
              {t("riskOverview")}
            </CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/auditor">{t("openAuditor")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{report.score}</span>
              <span className="text-sm text-muted-foreground">{t("riskScoreSuffix")}</span>
              <Badge variant={SEV_VARIANT[report.posture]} className="ml-auto">
                {t(`posture.${report.posture}`)}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="destructive">{t("sev.risk", { n: report.counts.risk })}</Badge>
              <Badge variant="default">{t("sev.warn", { n: report.counts.warn })}</Badge>
              <Badge variant="outline">{t("sev.info", { n: report.counts.info })}</Badge>
              <Badge variant="secondary">{t("sev.ok", { n: report.counts.ok })}</Badge>
            </div>
            {activeFindings.length > 0 && (
              <ul className="space-y-1 text-sm">
                {activeFindings.slice(0, 4).map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge variant={SEV_VARIANT[f.severity]} className="mt-0.5 shrink-0">
                      {t(`sevName.${f.severity}`)}
                    </Badge>
                    <span className="text-muted-foreground">{f.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {t("governanceLabel")}: {governanceFindings.length} ·{" "}
              {t("deploymentLabel")}: {deploymentFindings.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("asOf", { time: generatedAt })}
            </p>
          </CardContent>
        </Card>

        {/* ── Company Health ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" aria-hidden="true" />
              {t("companyHealth")}
            </CardTitle>
            <CardDescription>{t("companyHealthHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold">{props.objectivesTotal}</p>
              <p className="text-sm text-muted-foreground">{t("objectivesLabel")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{props.workTotal}</p>
              <p className="text-sm text-muted-foreground">{t("executionLabel")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{props.pendingApprovals}</p>
              <p className="text-sm text-muted-foreground">{t("approvalsPendingLabel")}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{props.decidedApprovals}</p>
              <p className="text-sm text-muted-foreground">{t("approvalsDecidedLabel")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Agent Health ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="size-4 text-primary" aria-hidden="true" />
            {t("agentHealth")}
          </CardTitle>
          <CardDescription>{t("agentHealthHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AIOS_WORKFORCE.map((a) => {
            const contributions = contribByAgent.get(a.key) ?? 0;
            const statusText =
              a.key === "auditor"
                ? t(`posture.${report.posture}`)
                : contributions > 0
                  ? t("contributions", { n: contributions })
                  : t("ready");
            return (
              <div key={a.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{a.name}</span>
                  <Badge variant={a.key === "auditor" ? SEV_VARIANT[report.posture] : "secondary"}>
                    {statusText}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.role}</p>
                {a.julius === "steward" && (
                  <p className="mt-1 text-xs text-primary">{t("juliusSteward")}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Strategic Recommendations ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            {t("recommendations")}
          </CardTitle>
          <CardDescription>{t("recommendationsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recs.slice(0, 6).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Badge variant={recVariant[r.priority]} className="mt-0.5 shrink-0">
                  {t(`recPriority.${r.priority}`)}
                </Badge>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
          {awareness.total > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("juliusAware", { n: awareness.total })} ·{" "}
              {formatDate(new Date().toISOString(), locale)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
