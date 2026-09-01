"use client";

import { type ReactNode, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  KeyRound,
  ListChecks,
  Plug,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ConnectorGlyph } from "@/components/brand/brand-icons";

/**
 * Serializable connector view-model produced by the Integration Center server
 * page from the existing backend (getConnectorHealth + connector registry +
 * connect-gate). No values are invented here — every field is real.
 */
export interface ConnectorView {
  id: string;
  name: string;
  category: string;
  initials: string;
  auth: string;
  oauthFamily: string | null;
  docsUrl: string;
  scopeCount: number;
  authorizable: boolean;
  connected: boolean;
  configured: boolean;
  identity: string | null;
  checkedAt: string | null;
  requiredScopes: string[];
  grantedScopes: string[];
  state: string | null;
  status: string;
  tokenEncryption: string | null;
  hasRefreshToken: boolean;
  refreshable: boolean;
  expiresAt: string | null;
  isExpired: boolean;
  lastRefresh: string | null;
  connectedAt: string | null;
  recommendedAction: string | null;
  healthScore: number | null;
  affordance: string;
  connectHref: string;
  classification: string;
  classificationLabel: string;
  classificationDescription: string;
  implementedCapabilities: string[];
  unavailableCapabilities: string[];
  founderActions: string[];
  diagnostics: string[];
  selfTestAvailable: boolean;
  implementedReadCount: number;
  implementedWriteCount: number;
  declaredReadCount: number;
  declaredWriteCount: number;
}

type StateKey =
  | "healthy"
  | "expired_refreshable"
  | "plaintext_token"
  | "needs_reauth"
  | "setup_required"
  | "unknown";

const STATE_META: Record<
  StateKey,
  { label: string; badge: "default" | "secondary" | "outline" | "destructive"; dot: string }
> = {
  healthy: { label: "Healthy", badge: "default", dot: "bg-emerald-500" },
  expired_refreshable: { label: "Auto-refreshing", badge: "secondary", dot: "bg-amber-500" },
  plaintext_token: { label: "Token unencrypted", badge: "secondary", dot: "bg-orange-500" },
  needs_reauth: { label: "Needs reconnect", badge: "destructive", dot: "bg-red-500" },
  setup_required: { label: "Setup required", badge: "outline", dot: "bg-muted-foreground" },
  unknown: { label: "Unknown", badge: "outline", dot: "bg-muted-foreground" },
};

function stateMeta(state: string | null) {
  return STATE_META[(state as StateKey) ?? "unknown"] ?? STATE_META.unknown;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeExpiry(iso: string | null): string {
  if (!iso) return "No expiry";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return `Expired ${fmtDateTime(iso)}`;
  if (mins < 60) return `Expires in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `Expires in ${hrs} h`;
  return `Expires ${fmtDate(iso)}`;
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

type FilterKey = "all" | "connected" | "attention" | "available";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "connected", label: "Connected" },
  { key: "attention", label: "Needs attention" },
  { key: "available", label: "Available" },
];

const ATTENTION_STATES = new Set(["needs_reauth", "plaintext_token"]);

const CLASSIFICATION_BADGE: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  production_ready: "default",
  partial: "secondary",
  read_only: "secondary",
  configuration_required: "outline",
  reauthorization_required: "destructive",
  framework_only: "outline",
  unsupported: "outline",
};

export function IntegrationCenter({
  items,
  overallHealth,
  generatedAt,
}: {
  items: ConnectorView[];
  overallHealth: number | null;
  generatedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [category, setCategory] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category))).sort(),
    [items],
  );

  const counts = useMemo(() => {
    const connected = items.filter((i) => i.connected);
    return {
      connected: connected.length,
      healthy: connected.filter((i) => i.state === "healthy").length,
      attention: connected.filter((i) => ATTENTION_STATES.has(i.state ?? "")).length,
      productionReady: items.filter((i) => i.classification === "production_ready").length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => {
        if (filter === "connected" && !i.connected) return false;
        if (filter === "attention" && !(i.connected && ATTENTION_STATES.has(i.state ?? ""))) return false;
        if (filter === "available" && !(!i.connected && i.authorizable)) return false;
        if (category !== "all" && i.category !== category) return false;
        if (q && !(`${i.name} ${i.id} ${i.category} ${i.oauthFamily ?? ""}`.toLowerCase().includes(q)))
          return false;
        return true;
      })
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        return (b.healthScore ?? -1) - (a.healthScore ?? -1) || a.name.localeCompare(b.name);
      });
  }, [items, query, filter, category]);

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="flex flex-col gap-6">
      {/* Summary / overall health */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col gap-2 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Overall health
            </span>
            {overallHealth === null ? (
              <span className="text-2xl font-semibold text-muted-foreground">—</span>
            ) : (
              <>
                <span className={cn("text-3xl font-semibold tabular-nums", scoreColor(overallHealth))}>
                  {overallHealth}
                  <span className="text-base text-muted-foreground">/100</span>
                </span>
                <Progress value={overallHealth} />
              </>
            )}
          </CardContent>
        </Card>
        <SummaryStat icon={<Plug className="size-4" />} label="Connected" value={counts.connected} />
        <SummaryStat
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          label="Healthy"
          value={counts.healthy}
        />
        <SummaryStat
          icon={<ShieldCheck className="size-4 text-emerald-500" />}
          label="Production-ready"
          value={counts.productionReady}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search connectors…"
            className="pl-8"
            aria-label="Search connectors"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs capitalize shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Connector grid */}
      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No connectors match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <ConnectorCard
              key={c.id}
              c={c}
              open={expanded === c.id}
              onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Live data from the connector health service · refreshed {fmtDateTime(generatedAt)}
      </p>
    </div>
  );
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right text-xs font-medium">{children}</span>
    </div>
  );
}

function CapabilityList({ values, empty }: { values: string[]; empty: string }) {
  if (values.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 8).map((value) => (
        <Badge key={value} variant="outline" className="text-[11px] font-normal">
          {value}
        </Badge>
      ))}
      {values.length > 8 ? (
        <Badge variant="outline" className="text-[11px] font-normal">
          +{values.length - 8} more
        </Badge>
      ) : null}
    </div>
  );
}

function ConnectorCard({
  c,
  open,
  onToggle,
}: {
  c: ConnectorView;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = stateMeta(c.state);
  const encrypted = c.tokenEncryption === "encrypted";
  const canConnect = c.affordance === "connect" || c.affordance === "reauthorize";
  const finishSetup = c.affordance === "finish_setup";
  const classificationBadge = CLASSIFICATION_BADGE[c.classification] ?? "outline";
  const hasDetails =
    c.connected ||
    c.founderActions.length > 0 ||
    c.diagnostics.length > 0 ||
    c.implementedCapabilities.length > 0 ||
    c.unavailableCapabilities.length > 0 ||
    c.requiredScopes.length > 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <ConnectorGlyph id={c.id} initials={c.initials} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{c.name}</h3>
            </div>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {c.category.replace(/_/g, " ")} · {c.auth === "oauth2" ? "OAuth 2.0" : c.auth.replace(/_/g, " ")}
            </p>
            {c.identity ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">Identity: {c.identity}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {c.connected ? (
              <span className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", meta.dot)} aria-hidden="true" />
                <Badge variant={meta.badge} className="shrink-0">
                  {meta.label}
                </Badge>
              </span>
            ) : finishSetup ? (
              <Badge variant="outline" className="shrink-0">
                Setup required
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                {c.authorizable ? "Available" : "Coming soon"}
              </Badge>
            )}
            <Badge variant={classificationBadge} className="shrink-0">
              {c.classificationLabel}
            </Badge>
          </div>
        </div>

        {/* Health score bar for connected connectors */}
        {c.connected && c.healthScore !== null ? (
          <div className="flex items-center gap-2">
            <Progress value={c.healthScore} className="h-1.5" />
            <span className={cn("text-xs font-semibold tabular-nums", scoreColor(c.healthScore))}>
              {c.healthScore}
            </span>
          </div>
        ) : null}

        {/* Compact real-data facts */}
        {c.connected ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {encrypted ? (
                <ShieldCheck className="size-3.5 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-3.5 text-orange-500" />
              )}
              {encrypted ? "Encrypted" : "Unencrypted"}
            </span>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="size-3.5" />
              Auto-refresh {c.refreshable ? "on" : "off"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {relativeExpiry(c.expiresAt)}
            </span>
          </div>
        ) : null}

        <div className="grid gap-2 rounded-md bg-muted/35 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" />
              {c.implementedReadCount + c.implementedWriteCount}/
              {c.declaredReadCount + c.declaredWriteCount} capabilities implemented
            </span>
            <span>{c.configured ? "Developer config present" : "Developer config pending"}</span>
            {c.selfTestAvailable ? <span>Self-test available</span> : null}
          </div>
          <p className="text-muted-foreground">{c.classificationDescription}</p>
        </div>

        {/* Recommended action */}
        {c.connected && c.recommendedAction && c.state !== "healthy" ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <span>{c.recommendedAction}</span>
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canConnect ? (
            <Button asChild size="sm" className="h-7">
              <a href={c.connectHref}>
                <Plug className="size-3.5" />
                {c.affordance === "reauthorize" ? "Reconnect" : "Connect"}
              </a>
            </Button>
          ) : null}
          {c.selfTestAvailable && c.connected ? (
            <Button asChild variant="outline" size="sm" className="h-7">
              <a href={`/api/admin/integrations/${c.id}/selftest`}>
                <Activity className="size-3.5" />
                Self-test
              </a>
            </Button>
          ) : null}
          {c.connected && c.auth === "api_key" ? (
            <Button asChild variant="outline" size="sm" className="h-7">
              <a href={`/settings/diagnostics#${c.id}-update`}>
                <KeyRound className="size-3.5" />
                Update key
              </a>
            </Button>
          ) : null}
          {hasDetails ? (
            <Button variant="ghost" size="sm" className="h-7" onClick={onToggle} aria-expanded={open}>
              Details
              <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
            </Button>
          ) : null}
          <a
            href={c.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Expandable detail — all real fields + connection timeline */}
        {open && hasDetails ? (
          <div className="mt-1 border-t pt-2">
            <DetailRow icon={<Activity className="size-3.5" />} label="Status">
              <span className="capitalize">{c.status.replace(/_/g, " ")}</span>
            </DetailRow>
            <DetailRow icon={<Plug className="size-3.5" />} label="Identity">
              {c.identity ?? "Not verified"}
            </DetailRow>
            <DetailRow icon={<KeyRound className="size-3.5" />} label="Token encryption">
              {c.connected
                ? c.tokenEncryption === "encrypted"
                  ? "AES-256-GCM (enc:v1)"
                  : c.tokenEncryption === "plaintext"
                    ? "Plaintext (backfill pending)"
                    : "No token stored"
                : "No token stored"}
            </DetailRow>
            <DetailRow icon={<RefreshCw className="size-3.5" />} label="Auto-refresh">
              {c.refreshable ? "Enabled" : c.hasRefreshToken ? "Refresh token present" : "Not supported"}
            </DetailRow>
            <DetailRow icon={<Clock className="size-3.5" />} label="Token expires">
              {c.expiresAt ? fmtDateTime(c.expiresAt) : "No expiry"}
            </DetailRow>
            <DetailRow icon={<Activity className="size-3.5" />} label="Last refresh / sync">
              {fmtDateTime(c.lastRefresh)}
            </DetailRow>
            <DetailRow icon={<Plug className="size-3.5" />} label="Connected">
              {fmtDateTime(c.connectedAt)}
            </DetailRow>
            <DetailRow icon={<ShieldCheck className="size-3.5" />} label="OAuth">
              {c.oauthFamily ? `${c.oauthFamily} · ${c.scopeCount} scope(s)` : "—"}
            </DetailRow>
            <DetailRow icon={<Clock className="size-3.5" />} label="Last health check">
              {fmtDateTime(c.checkedAt)}
            </DetailRow>
            <div className="mt-3 grid gap-3">
              <div>
                <p className="mb-1.5 text-xs font-medium">Implemented capabilities</p>
                <CapabilityList values={c.implementedCapabilities} empty="No runtime capability is currently implemented." />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium">Unavailable capabilities</p>
                <CapabilityList values={c.unavailableCapabilities} empty="No unavailable declared capabilities." />
              </div>
              {c.founderActions.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium">Founder actions</p>
                  <ul className="grid gap-1 text-xs text-muted-foreground">
                    {c.founderActions.map((action) => (
                      <li key={action}>- {action}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {c.diagnostics.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium">Safe diagnostics</p>
                  <ul className="grid gap-1 text-xs text-muted-foreground">
                    {c.diagnostics.map((diagnostic) => (
                      <li key={diagnostic}>- {diagnostic}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {c.requiredScopes.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium">Scopes</p>
                  <p className="break-words text-xs text-muted-foreground">
                    Required: {c.requiredScopes.join(", ")}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    Granted: {c.grantedScopes.length > 0 ? c.grantedScopes.join(", ") : "Not connected"}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
