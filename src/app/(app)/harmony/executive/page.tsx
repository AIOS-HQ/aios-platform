import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrendingUp, Flame, Timer, Repeat, ShieldCheck, Network, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getEnvelope } from "@/lib/company/envelope";
import { buildDigitalTwin } from "@/lib/company/digital-twin";
import { getCompanyFinancialSnapshot, type FinancialSnapshot } from "@/lib/ledger";
import { internalRuntimeHealthApi } from "@/lib/runtime/health-api";
import type { ProbeScope, RuntimeProbeSummary } from "@/lib/runtime/probes/types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Executive Dashboard · AIOS" };

function money(n: number | null, currency: string): string {
  if (n === null) return "—";
  const sym = currency === "USD" ? "$" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sym}${(n / 1_000).toFixed(0)}K`;
  return `${sym}${n.toFixed(0)}`;
}
function pct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}
function ratio(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}×`;
}

const XAI_QUESTIONS = [
  "Why was this action taken?",
  "Which Company Context influenced it?",
  "Which Skills were used?",
  "Which Memory influenced it?",
  "Which Connectors participated?",
  "Which Policies applied?",
  "Which Approvals were required?",
  "Which evidence supported the decision?",
];

/**
 * Executive & Explainability Dashboard (Priority 13). Admin-only. Composes the
 * Ledger FinancialSnapshot + the Digital Twin (organization, objectives,
 * connectors, risks, knowledge graph) into a Founder cockpit, plus the Law-7
 * explainability contract. Real data only; empty until the envelope's financial
 * context + objectives are populated.
 */
export default async function ExecutiveDashboardPage() {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) notFound();

  const companyId = await resolvePrimaryCompanyId();
  const [envelope, twin, fin] = await Promise.all([
    companyId ? getEnvelope(companyId) : Promise.resolve(null),
    companyId ? buildDigitalTwin(user.id, companyId) : Promise.resolve(null),
    companyId ? getCompanyFinancialSnapshot(companyId) : Promise.resolve(null),
  ]);

  const snap: FinancialSnapshot | null = fin;
  const cur = snap?.currency ?? "USD";
  const objectives = envelope?.objectives ?? [];

  const runtimeScope: ProbeScope = {
    userId: user.id,
    companyId: companyId ?? null,
  };

  let runtimeSummary: RuntimeProbeSummary | null = null;
  let runtimeMetadata: ReturnType<typeof internalRuntimeHealthApi.getRuntimeHealthMetadata> | null = null;
  try {
    runtimeSummary = await internalRuntimeHealthApi.getRuntimeHealthSummary(runtimeScope);
    runtimeMetadata = internalRuntimeHealthApi.getRuntimeHealthMetadata(runtimeScope);
  } catch {
    runtimeSummary = null;
    runtimeMetadata = null;
  }

  const runtimeCounts = (runtimeSummary?.categories ?? []).reduce(
    (acc, category) => ({
      total: acc.total + category.total,
      healthy: acc.healthy + category.healthy,
      degraded: acc.degraded + category.degraded,
      failed: acc.failed + category.failed,
      unknown: acc.unknown + category.unknown,
      stale: acc.stale + category.stale,
    }),
    { total: 0, healthy: 0, degraded: 0, failed: 0, unknown: 0, stale: 0 },
  );

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        description="Founder cockpit — Ledger financials + the Digital Twin, with Law-7 explainability."
      />

      <div className="flex flex-col gap-6 lg:max-w-5xl">
        {/* Ledger KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><TrendingUp className="size-4" aria-hidden="true" /> ARR</p>
              <p className="mt-1 text-2xl font-bold">{money(snap?.arr ?? null, cur)}</p>
              <p className="text-xs text-muted-foreground">MRR {money(snap?.mrr ?? null, cur)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Flame className="size-4" aria-hidden="true" /> Net burn</p>
              <p className="mt-1 text-2xl font-bold">{money(snap?.burnRate ?? null, cur)}<span className="text-sm text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">cash {money(snap?.cashOnHand ?? null, cur)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Timer className="size-4" aria-hidden="true" /> Runway</p>
              <p className="mt-1 text-2xl font-bold">{snap?.runwayMonths != null ? snap.runwayMonths.toFixed(1) : "—"}<span className="text-sm text-muted-foreground"> mo</span></p>
              <p className="text-xs text-muted-foreground">margin {pct(snap?.grossMargin ?? null)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Repeat className="size-4" aria-hidden="true" /> NRR</p>
              <p className="mt-1 text-2xl font-bold">{pct(snap?.nrr ?? null)}</p>
              <p className="text-xs text-muted-foreground">churn {pct(snap?.churnRate ?? null)} · LTV:CAC {ratio(snap?.ltvCacRatio ?? null)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-base">Operational Runtime Health</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><span className="text-muted-foreground">Overall status</span><p className="font-medium">{runtimeSummary?.status ?? "unknown"}</p></div>
            <div><span className="text-muted-foreground">Generated</span><p className="font-medium">{runtimeSummary?.generatedAt ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Freshness</span><p className="font-medium">{runtimeMetadata ? (runtimeMetadata.stale ? "stale" : "fresh") : "unknown"}</p></div>
            <div><span className="text-muted-foreground">Expires</span><p className="font-medium">{runtimeMetadata?.expiresAt ?? "—"}</p></div>
            <div><span className="text-muted-foreground">Total probes</span><p className="font-medium">{runtimeCounts.total}</p></div>
            <div><span className="text-muted-foreground">Healthy</span><p className="font-medium">{runtimeCounts.healthy}</p></div>
            <div><span className="text-muted-foreground">Degraded</span><p className="font-medium">{runtimeCounts.degraded}</p></div>
            <div><span className="text-muted-foreground">Failed</span><p className="font-medium">{runtimeCounts.failed}</p></div>
            <div><span className="text-muted-foreground">Unknown</span><p className="font-medium">{runtimeCounts.unknown}</p></div>
            <div><span className="text-muted-foreground">Stale</span><p className="font-medium">{runtimeCounts.stale}</p></div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Objectives */}
          <Card>
            <CardHeader className="space-y-0 pb-2"><CardTitle className="text-base">Company Objectives</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {objectives.length === 0 ? (
                <p className="text-muted-foreground">No objectives set in the Company Context Envelope yet.</p>
              ) : (
                <ul className="space-y-2">
                  {objectives.slice(0, 8).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">{o.title}</span>
                      {o.status ? <Badge variant="secondary" className="shrink-0">{o.status}</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Digital Twin summary */}
          <Card>
            <CardHeader className="space-y-0 pb-2"><CardTitle className="flex items-center gap-2 text-base"><Network className="size-4" aria-hidden="true" /> Digital Twin</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Departments</span><span className="text-right font-medium">{twin?.organization.departments ?? 0}</span>
              <span className="text-muted-foreground">AI workforce</span><span className="text-right font-medium">{twin?.organization.aiWorkforce ?? 0}</span>
              <span className="text-muted-foreground">Human workforce</span><span className="text-right font-medium">{twin?.organization.humanWorkforce ?? 0}</span>
              <span className="text-muted-foreground">Connectors bound</span><span className="text-right font-medium">{twin?.connectors.bound ?? 0}</span>
              <span className="text-muted-foreground">Knowledge graph</span><span className="text-right font-medium">{twin?.graph.nodes ?? 0} / {twin?.graph.edges ?? 0}</span>
              <span className="text-muted-foreground">Objectives · priorities</span><span className="text-right font-medium">{twin?.direction.objectives ?? 0} · {twin?.direction.priorities ?? 0}</span>
            </CardContent>
          </Card>
        </div>

        {/* Risks */}
        {twin && twin.risks.length > 0 ? (
          <Card className="border-warning/30">
            <CardHeader className="space-y-0 pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="size-4 text-warning" aria-hidden="true" /> Risks ({twin.risks.length})</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {twin.risks.length} risk{twin.risks.length === 1 ? "" : "s"} tracked in the company governance profile.
            </CardContent>
          </Card>
        ) : null}

        {/* Explainability (Law 7) */}
        <Card className="border-primary/20">
          <CardHeader className="space-y-0 pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Explainability (Law 7)</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <p className="mb-3 text-muted-foreground">Every autonomous decision is reconstructable — each answers:</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {XAI_QUESTIONS.map((q) => (
                <li key={q} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {q}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Per-decision traces render here as the capability-telemetry store is wired (correlation id → context, skills, memory, connectors, policies, approvals, evidence).
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
