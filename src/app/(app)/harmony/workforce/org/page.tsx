import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  buildOrgGraph,
  getWorkerRelationships,
  agentName,
  RELATION_TYPES,
  FOUNDER_NODE,
  type RelationType,
  type WorkerRelationships,
} from "@/lib/workforce/relationships";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("org");
  return { title: t("title") };
}

const REL_COLORS: Record<RelationType, string> = {
  reports_to: "#475569",
  works_with: "#2563eb",
  depends_on: "#d97706",
  provides_data_to: "#059669",
  receives_data_from: "#0d9488",
  can_train: "#7c3aed",
  can_replace: "#e11d48",
};

// Deterministic hierarchical layout (viewBox 1000 x 620).
const POSITIONS: Record<string, { x: number; y: number }> = {
  founder: { x: 500, y: 54 },
  harmony: { x: 500, y: 182 },
  atlas: { x: 130, y: 356 },
  auditor: { x: 377, y: 356 },
  catalyst: { x: 623, y: 356 },
  ambassador: { x: 870, y: 356 },
  pulse: { x: 130, y: 536 },
  horizon: { x: 377, y: 536 },
  aegis: { x: 623, y: 536 },
  ledger: { x: 870, y: 536 },
};

const NODE_W = 132;
const NODE_H = 46;

function isRelationType(v: string | undefined): v is RelationType {
  return !!v && (RELATION_TYPES as readonly string[]).includes(v);
}

/** Field order for the per-worker relationship matrix. */
const MATRIX_FIELDS: { field: keyof WorkerRelationships; type: RelationType }[] = [
  { field: "reportsTo", type: "reports_to" },
  { field: "worksWith", type: "works_with" },
  { field: "dependsOn", type: "depends_on" },
  { field: "providesDataTo", type: "provides_data_to" },
  { field: "receivesDataFrom", type: "receives_data_from" },
  { field: "canTrain", type: "can_train" },
  { field: "canReplace", type: "can_replace" },
];

export default async function WorkforceOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ rel?: string }>;
}) {
  await requireUser();
  const t = await getTranslations("org");
  const sp = await searchParams;
  const selected = isRelationType(sp.rel) ? sp.rel : null;

  const graph = buildOrgGraph();

  // Draw edges: reverse "receives_data_from" so every arrow shows real flow
  // direction. De-dup symmetric works_with pairs to avoid double lines.
  const seenWorksWith = new Set<string>();
  const drawn = graph.edges
    .filter((e) => (selected ? e.type === selected : true))
    .filter((e) => {
      if (e.type !== "works_with") return true;
      const k = [e.from, e.to].sort().join("|");
      if (seenWorksWith.has(k)) return false;
      seenWorksWith.add(k);
      return true;
    })
    .map((e) => {
      const from = e.type === "receives_data_from" ? e.to : e.from;
      const to = e.type === "receives_data_from" ? e.from : e.to;
      return { ...e, drawFrom: from, drawTo: to };
    })
    .filter((e) => POSITIONS[e.drawFrom] && POSITIONS[e.drawTo]);

  const directedTypes = RELATION_TYPES.filter((rt) => rt !== "works_with");

  // Per-type link counts (over the full model, not the filtered view).
  const counts = new Map<RelationType, number>();
  for (const e of graph.edges) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);

  const workers = graph.nodes.filter((n) => n.key !== FOUNDER_NODE);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6">
        <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          {t("howToRead")}
        </p>

        {/* Relationship-type filter */}
        <nav aria-label={t("legendTitle")} className="flex flex-wrap gap-2">
          <Link
            href="/harmony/workforce/org"
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
              selected === null ? "bg-foreground text-background" : "text-muted-foreground"
            }`}
          >
            {t("filterAll")}
          </Link>
          {RELATION_TYPES.map((rt) => (
            <Link
              key={rt}
              href={`/harmony/workforce/org?rel=${rt}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
                selected === rt ? "bg-foreground text-background" : "text-muted-foreground"
              }`}
            >
              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: REL_COLORS[rt] }} />
              {t(`rel.${rt}`)}
              <span className="opacity-60">{counts.get(rt) ?? 0}</span>
            </Link>
          ))}
        </nav>

        {/* Org graph */}
        <Card>
          <CardContent className="p-2 sm:p-4">
            <svg viewBox="0 0 1000 620" className="h-auto w-full" role="img" aria-label={t("title")}>
              <defs>
                {directedTypes.map((rt) => (
                  <marker
                    key={rt}
                    id={`arw-${rt}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={REL_COLORS[rt]} />
                  </marker>
                ))}
              </defs>

              {/* Edges (drawn first, nodes drawn on top) */}
              {drawn.map((e, i) => {
                const s = POSITIONS[e.drawFrom];
                const d = POSITIONS[e.drawTo];
                const dx = d.x - s.x;
                const dy = d.y - s.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                const padStart = 30;
                const padEnd = e.type === "works_with" ? 30 : 40;
                const x1 = s.x + ux * padStart;
                const y1 = s.y + uy * padStart;
                const x2 = d.x - ux * padEnd;
                const y2 = d.y - uy * padEnd;
                return (
                  <line
                    key={`${e.type}-${e.from}-${e.to}-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={REL_COLORS[e.type]}
                    strokeWidth={e.type === "reports_to" ? 2.4 : 1.6}
                    strokeOpacity={0.85}
                    strokeDasharray={e.type === "can_replace" ? "5 4" : undefined}
                    markerEnd={e.type === "works_with" ? undefined : `url(#arw-${e.type})`}
                  />
                );
              })}

              {/* Nodes */}
              {graph.nodes.map((n) => {
                const p = POSITIONS[n.key];
                if (!p) return null;
                const isFounder = n.key === FOUNDER_NODE;
                const isHarmony = n.key === "harmony";
                const fill = isFounder ? "#0f172a" : isHarmony ? "#1e293b" : "#ffffff";
                const stroke = isFounder ? "#0f172a" : isHarmony ? "#1e293b" : "#cbd5e1";
                const textColor = isFounder || isHarmony ? "#ffffff" : "#0f172a";
                const label = isFounder ? t("founder") : n.name;
                const rect = (
                  <g>
                    <rect
                      x={p.x - NODE_W / 2}
                      y={p.y - NODE_H / 2}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                    />
                    <text
                      x={p.x}
                      y={p.y - 3}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight={600}
                      fill={textColor}
                    >
                      {label}
                    </text>
                    <text x={p.x} y={p.y + 13} textAnchor="middle" fontSize="9.5" fill={isFounder || isHarmony ? "#cbd5e1" : "#64748b"}>
                      {n.role.length > 22 ? `${n.role.slice(0, 21)}…` : n.role}
                    </text>
                  </g>
                );
                return isFounder ? (
                  <g key={n.key}>{rect}</g>
                ) : (
                  <a key={n.key} href={`/harmony/workforce/${n.key}`}>
                    {rect}
                  </a>
                );
              })}
            </svg>
          </CardContent>
        </Card>

        {/* Relationship matrix */}
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{t("matrixTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workers.map((w) => {
              const rel = getWorkerRelationships(w.key);
              if (!rel) return null;
              return (
                <Card key={w.key}>
                  <CardContent className="flex flex-col gap-2.5 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/harmony/workforce/${w.key}`}
                        className="text-base font-semibold underline-offset-2 hover:underline"
                      >
                        {w.name}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">
                        {w.role}
                      </Badge>
                    </div>
                    <dl className="flex flex-col gap-1.5 text-xs">
                      {MATRIX_FIELDS.map(({ field, type }) => {
                        const raw = rel[field];
                        const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
                        const names = values.map((v) => (v === FOUNDER_NODE ? t("founder") : agentName(v)));
                        return (
                          <div key={type} className="flex items-baseline gap-2">
                            <dt className="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground/80">
                              <span className="inline-block size-2 rounded-full" style={{ backgroundColor: REL_COLORS[type] }} />
                              {t(`rel.${type}`)}
                            </dt>
                            <dd className="text-foreground">{names.length ? names.join(", ") : t("none")}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
