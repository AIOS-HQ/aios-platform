import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Brain } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { AIOS_WORKFORCE, getAiosAgent } from "@/lib/workforce/registry";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listJuliusEntries } from "@/lib/julius/service";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { getWorkforceSummary, emptyAgentSummary } from "@/lib/workforce/summary";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("graph");
  return { title: t("title") };
}

const ACTIVE = ["open", "delegated", "in_progress", "awaiting_approval"];
const STATUS_COLOR: Record<string, string> = {
  working: "#16a34a",
  awaiting: "#ca8a04",
  online: "#2563eb",
  idle: "#64748b",
  error: "#dc2626",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

const CX = 320;
const CY = 250;
const R = 190;
const VW = 640;
const VH = 520;

export default async function WorkforceGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const t = await getTranslations("graph");
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();
  const sp = await searchParams;

  const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30 };
  const days = RANGE_DAYS[sp.range ?? ""] ?? 0;
  const cutoff = days > 0 ? Date.now() - days * 86_400_000 : 0;

  const [allMessages, julius, summary] = await Promise.all([
    companyId ? listAgentMessages(user.id, companyId, { limit: 200 }) : Promise.resolve([]),
    companyId ? listJuliusEntries(user.id, companyId, { limit: 200 }) : Promise.resolve([]),
    getWorkforceSummary(user.id, companyId),
  ]);
  const messages =
    cutoff === 0
      ? allMessages
      : allMessages.filter((m) => new Date(m.created_at).getTime() >= cutoff);

  const approvalsByAgent: Record<string, number> = {};
  for (const m of messages) {
    if (m.status === "awaiting_approval") {
      approvalsByAgent[m.to_agent] = (approvalsByAgent[m.to_agent] ?? 0) + 1;
    }
  }

  const placed = AIOS_WORKFORCE.map((a, i) => {
    const ang = (i / AIOS_WORKFORCE.length) * 2 * Math.PI - Math.PI / 2;
    const sent = messages.filter((m) => m.from_agent === a.key).length;
    const received = messages.filter((m) => m.to_agent === a.key).length;
    const active = messages.filter((m) => m.to_agent === a.key && ACTIVE.includes(m.status)).length;
    const inflight = messages.find((m) => m.to_agent === a.key && ACTIVE.includes(m.status));
    const status = inflight
      ? inflight.status === "awaiting_approval" ? "awaiting" : "working"
      : sent + received > 0 ? "online" : "idle";
    return {
      key: a.key,
      name: a.name,
      x: CX + R * Math.cos(ang),
      y: CY + R * Math.sin(ang),
      sent,
      received,
      active,
      status,
    };
  });
  // Keyed by string: agent_messages.from_agent/to_agent and julius_entries.agent
  // are arbitrary strings, while the typed roster (AiosAgentKey) is the node set.
  const posByKey = new Map<string, (typeof placed)[number]>(
    placed.map((p) => [p.key, p]),
  );

  const edgeMap = new Map<string, { from: string; to: string; count: number; approvals: number }>();
  for (const m of messages) {
    if (m.from_agent === m.to_agent) continue;
    const k = `${m.from_agent}>${m.to_agent}`;
    const e = edgeMap.get(k) ?? { from: m.from_agent, to: m.to_agent, count: 0, approvals: 0 };
    e.count += 1;
    if (m.risk !== "routine" || m.status === "awaiting_approval") e.approvals += 1;
    edgeMap.set(k, e);
  }
  const edges = Array.from(edgeMap.values()).filter(
    (e) => posByKey.has(e.from) && posByKey.has(e.to),
  );

  const juliusByAgent = new Map<string, number>();
  for (const e of julius) juliusByAgent.set(e.agent, (juliusByAgent.get(e.agent) ?? 0) + 1);
  const juliusEdges = Array.from(juliusByAgent.entries()).filter(([k]) => posByKey.has(k));

  const hasData = edges.length > 0 || juliusEdges.length > 0;
  const topRoutes = Array.from(edges).sort((a, b) => b.count - a.count).slice(0, 6);
  const agentName = (k: string) => getAiosAgent(k)?.name ?? k;

  const legend = [
    { status: "working", label: t("legend.working") },
    { status: "online", label: t("legend.online") },
    { status: "awaiting", label: t("legend.awaiting") },
    { status: "idle", label: t("legend.idle") },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/workforce">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("back")}
          </Link>
        </Button>
        <form method="get" className="flex items-center gap-2">
          <select
            name="range"
            defaultValue={sp.range ?? ""}
            aria-label={t("rangeLabel")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">{t("range.all")}</option>
            <option value="7d">{t("range.7d")}</option>
            <option value="30d">{t("range.30d")}</option>
          </select>
          <Button type="submit" variant="outline" size="sm">{t("apply")}</Button>
        </form>
      </PageHeader>

      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="p-4">
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className="mx-auto block h-auto w-full max-w-[640px] text-foreground"
              role="img"
              aria-label={t("title")}
            >
              {edges.map((e) => {
                const a = posByKey.get(e.from);
                const b = posByKey.get(e.to);
                if (!a || !b) return null;
                return (
                  <line
                    key={`${e.from}>${e.to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={e.approvals > 0 ? "#d97706" : "#94a3b8"}
                    strokeOpacity={0.55}
                    strokeWidth={1.5 + Math.min(e.count, 6)}
                  >
                    <title>{`${agentName(e.from)} → ${agentName(e.to)}: ${e.count} message(s)`}</title>
                  </line>
                );
              })}
              {juliusEdges.map(([k, n]) => {
                const a = posByKey.get(k);
                if (!a) return null;
                return (
                  <line
                    key={`j-${k}`}
                    x1={a.x}
                    y1={a.y}
                    x2={CX}
                    y2={CY}
                    stroke="#7c3aed"
                    strokeOpacity={0.4}
                    strokeDasharray="4 4"
                    strokeWidth={1.5 + Math.min(n, 5)}
                  >
                    <title>{`${agentName(k)} → Julius: ${n} memory contribution(s)`}</title>
                  </line>
                );
              })}

              {/* Julius hub */}
              <circle cx={CX} cy={CY} r={26} fill="#7c3aed" />
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#ffffff">
                Julius
              </text>

              {/* Agent nodes — clickable, link to the agent profile */}
              {placed.map((p) => {
                const sum = summary[p.key] ?? emptyAgentSummary();
                const appr = approvalsByAgent[p.key] ?? 0;
                return (
                  <a key={p.key} href={`/harmony/workforce/${p.key}`}>
                    <circle cx={p.x} cy={p.y} r={24} fill={STATUS_COLOR[p.status] ?? "#64748b"}>
                      <title>{`${p.name} — ${t(`legend.${p.status}`)} · ${sum.activeObjectives} obj · ${sum.queuedWork} work · ${sum.openRecommendations} recs · ${appr} approvals · ${p.sent}/${p.received} msgs`}</title>
                    </circle>
                    <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#ffffff">
                      {initials(p.name)}
                    </text>
                    {p.active > 0 ? (
                      <>
                        <circle cx={p.x + 18} cy={p.y - 18} r={8} fill="#0f172a" />
                        <text x={p.x + 18} y={p.y - 18} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#ffffff">
                          {p.active}
                        </text>
                      </>
                    ) : null}
                    <text x={p.x} y={p.y + 38} textAnchor="middle" fontSize={11} fill="currentColor">
                      {p.name}
                    </text>
                  </a>
                );
              })}
            </svg>

            {!hasData ? <InlineEmpty icon={Brain} message={t("empty")} /> : null}

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              {legend.map((l) => (
                <span key={l.status} className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[l.status] }} />
                  {l.label}
                </span>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "#94a3b8" }} />
                {t("legend.delegationEdge")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "#d97706" }} />
                {t("legend.approvalEdge")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: "#7c3aed" }} />
                {t("legend.juliusEdge")}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("topRoutes")}</CardTitle>
            <CardDescription>{t("topRoutesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {topRoutes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noRoutes")}</p>
            ) : (
              <ul className="space-y-2">
                {topRoutes.map((e) => (
                  <li key={`${e.from}>${e.to}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{agentName(e.from)} → {agentName(e.to)}</span>
                    <span className="flex items-center gap-2">
                      {e.approvals > 0 ? <Badge variant="default" className="text-[10px]">{t("approvals", { n: e.approvals })}</Badge> : null}
                      <Badge variant="secondary">{t("messages", { n: e.count })}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
