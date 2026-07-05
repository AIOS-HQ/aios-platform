import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users, ShieldCheck, Activity, Network, Cpu } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import {
  AIOS_WORKFORCE,
  getHarmony,
  WORKFORCE_SPECIALISTS,
  JULIUS,
  getAgentConnectors,
  isFounderOnlyAgent,
  type AiosAgent,
} from "@/lib/workforce/registry";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getEnvelope, type WorkerActivation } from "@/lib/company/envelope";
import { buildDigitalTwin } from "@/lib/company/digital-twin";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkerAvatar } from "@/components/workforce/worker-avatar";

export const metadata: Metadata = { title: "AI Workforce Directory · AIOS" };

type StatusVariant = "default" | "secondary" | "outline";

function statusOf(act: WorkerActivation | undefined): { label: string; variant: StatusVariant } {
  if (act?.enabled) return { label: "Active", variant: "default" };
  if (act) return { label: "Standby", variant: "secondary" };
  return { label: "Available", variant: "outline" };
}

function WorkerCard({
  agent,
  act,
  hero = false,
}: {
  agent: AiosAgent;
  act: WorkerActivation | undefined;
  hero?: boolean;
}) {
  const st = statusOf(act);
  const connectors = getAgentConnectors(agent.key);
  return (
    <Card className={hero ? "border-primary/30 bg-primary/5" : "transition hover:-translate-y-0.5 hover:border-primary/30"}>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <WorkerAvatar agentKey={agent.key} name={agent.name} size={hero ? "lg" : "md"} />
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 truncate text-base">
            {agent.name}
            {isFounderOnlyAgent(agent.key) ? (
              <Badge variant="outline" className="text-[10px]">Founder-only</Badge>
            ) : null}
          </CardTitle>
          <p className="truncate text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <Badge variant={st.variant} className="shrink-0">{st.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <p className="text-foreground/80">{agent.purpose}</p>
        <div className="grid grid-cols-2 gap-y-1">
          <span>Julius</span>
          <span className="text-right font-medium text-foreground">{agent.julius}</span>
          <span>Autonomy</span>
          <span className="text-right font-medium text-foreground">
            {typeof act?.autonomyLevel === "number" ? `L${act.autonomyLevel}` : "—"}
          </span>
          <span>Connectors</span>
          <span className="text-right font-medium text-foreground">{connectors.length || "—"}</span>
        </div>
        {connectors.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {connectors.slice(0, 6).map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{c}</span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * AI Workforce Directory (Priority 7) — the operational headquarters.
 *
 * Admin-only. Wires the official workforce registry to the live Company Context
 * Envelope (per-worker activation + autonomy) and the Digital Twin (org + graph
 * summary). Shows real configuration + status; per-worker live telemetry
 * (cost/tokens/queue/logs) surfaces here as the capability-telemetry store is
 * wired. No fabricated metrics.
 */
export default async function WorkforceDirectoryPage() {
  const user = await requireUser();
  if (!(await currentUserIsAdmin())) notFound();

  const companyId = await resolvePrimaryCompanyId();
  const [envelope, twin] = await Promise.all([
    companyId ? getEnvelope(companyId) : Promise.resolve(null),
    companyId ? buildDigitalTwin(user.id, companyId) : Promise.resolve(null),
  ]);

  const activation = new Map<string, WorkerActivation>(
    (envelope?.workforce ?? []).map((w) => [w.worker, w]),
  );
  const harmony = getHarmony();
  const activeCount = AIOS_WORKFORCE.filter((a) => activation.get(a.key)?.enabled).length;

  return (
    <>
      <PageHeader
        title="AI Workforce Directory"
        description="The operational headquarters — one universal runtime, specialized per worker by the Company Context Envelope."
      />

      <div className="flex flex-col gap-6 lg:max-w-5xl">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Users className="size-4" aria-hidden="true" /> Workforce
              </p>
              <p className="mt-1 text-2xl font-bold">
                {activeCount}
                <span className="text-sm text-muted-foreground">/{AIOS_WORKFORCE.length} active</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Activity className="size-4" aria-hidden="true" /> Objectives
              </p>
              <p className="mt-1 text-2xl font-bold">
                {twin?.direction.objectives ?? 0}
                <span className="text-sm text-muted-foreground"> · {twin?.direction.priorities ?? 0} priorities</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Cpu className="size-4" aria-hidden="true" /> Connectors
              </p>
              <p className="mt-1 text-2xl font-bold">
                {twin?.connectors.bound ?? 0}
                <span className="text-sm text-muted-foreground"> bound</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Network className="size-4" aria-hidden="true" /> Knowledge graph
              </p>
              <p className="mt-1 text-2xl font-bold">
                {twin?.graph.nodes ?? 0}
                <span className="text-sm text-muted-foreground"> nodes · {twin?.graph.edges ?? 0} edges</span>
              </p>
            </CardContent>
          </Card>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Chief of Staff</h2>
          <WorkerCard agent={harmony} act={activation.get(harmony.key)} hero />
        </section>

        <Card className="border-primary/20">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">{JULIUS.name} — {JULIUS.role}</p>
              <p className="text-xs text-muted-foreground">
                Not an agent: the organizational brain (knowledge graph, memory, decisions, skills), stewarded by Atlas.
                Every worker reads and writes here.
              </p>
            </div>
          </CardContent>
        </Card>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Specialist Workforce ({WORKFORCE_SPECIALISTS.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFORCE_SPECIALISTS.map((agent) => (
              <WorkerCard key={agent.key} agent={agent} act={activation.get(agent.key)} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
