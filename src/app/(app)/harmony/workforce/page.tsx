import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Activity, Brain, Send, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { AIOS_WORKFORCE, getAiosAgent } from "@/lib/workforce/registry";
import { resolvePrimaryCompanyId, getJuliusAwareness } from "@/lib/julius/wiring";
import { listAgentMessages, type AgentMessage } from "@/lib/harmony/agents/a2a";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import { AgentDispatchDialog } from "@/components/harmony/workforce/agent-dispatch-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workforce");
  return { title: t("title") };
}

type AgentStatus = "working" | "awaiting" | "online" | "idle";

const STATUS_VARIANT: Record<AgentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  working: "default",
  awaiting: "destructive",
  online: "secondary",
  idle: "outline",
};

const RISK_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  destructive: "destructive",
  approval: "default",
  routine: "outline",
};

const ACTIVE = ["open", "delegated", "in_progress", "awaiting_approval"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

/** Derive a live status for an agent from its recent agent-to-agent messages. */
function deriveState(key: string, messages: AgentMessage[]) {
  const mine = messages.filter((m) => m.from_agent === key || m.to_agent === key);
  const inflight = messages.find(
    (m) => m.to_agent === key && ACTIVE.includes(m.status),
  );
  const lastDone = messages.find(
    (m) =>
      (m.from_agent === key || m.to_agent === key) &&
      (m.status === "completed" || m.kind === "response"),
  );
  let status: AgentStatus = "idle";
  if (inflight) status = inflight.status === "awaiting_approval" ? "awaiting" : "working";
  else if (mine.length > 0) status = "online";
  return {
    status,
    currentTask: inflight?.subject ?? null,
    lastAction: lastDone?.subject ?? null,
    lastActive: mine[0]?.created_at ?? null,
  };
}

export default async function WorkforcePage() {
  const t = await getTranslations("workforce");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [messages, awareness] = await Promise.all([
    companyId ? listAgentMessages(user.id, companyId, { limit: 60 }) : Promise.resolve([]),
    companyId
      ? getJuliusAwareness(user.id, companyId)
      : Promise.resolve({ objectives: [], decisions: [], activities: [], knowledge: [], total: 0 }),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <AgentDispatchDialog
          agents={AIOS_WORKFORCE.map((a) => ({ key: a.key, name: a.name }))}
        >
          <Button>
            <Send className="size-4" aria-hidden="true" />
            {t("dispatch")}
          </Button>
        </AgentDispatchDialog>
      </PageHeader>

      <div className="flex flex-col gap-8">
        {/* ── Workforce Directory + Status Board ─────────────────────────── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            {t("directory")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Julius — the AIOS company brain, not a workforce agent. */}
            <Card className="border-primary/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
                    <Brain className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">Julius</p>
                    <p className="truncate text-xs text-muted-foreground">{t("brainRole")}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto">{t("brain")}</Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("juliusEntries", { n: awareness.total })}
                </p>
              </CardContent>
            </Card>

            {AIOS_WORKFORCE.map((a) => {
              const s = deriveState(a.key, messages);
              return (
                <Card key={a.key}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-bold">
                        {initials(a.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.role}</p>
                      </div>
                      <Badge variant={STATUS_VARIANT[s.status]} className="ml-auto shrink-0">
                        {t(`status.${s.status}`)}
                      </Badge>
                    </div>
                    <dl className="mt-3 space-y-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">{t("currentTask")}</dt>
                        <dd className="min-w-0 truncate">{s.currentTask ?? t("none")}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">{t("lastAction")}</dt>
                        <dd className="min-w-0 truncate">{s.lastAction ?? t("none")}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">{t("lastActive")}</dt>
                        <dd className="min-w-0 truncate">
                          {s.lastActive ? formatDate(s.lastActive, locale) : t("none")}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex gap-2">
                      <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                        <Link href={`/harmony/workforce/${a.key}`}>{t("viewProfile")}</Link>
                      </Button>
                      <Button asChild size="sm" className="h-7 px-2 text-xs">
                        <Link href={`/harmony/workforce/${a.key}`}>{t("openChat")}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ── Agent Communications (A2A activity feed) ───────────────────── */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-primary" aria-hidden="true" />
                {t("activity")}
              </CardTitle>
              <CardDescription>{t("activityHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <InlineEmpty icon={Activity} message={t("noActivity")} />
              ) : (
                <ul className="space-y-3">
                  {messages.map((m) => {
                    const from = getAiosAgent(m.from_agent)?.name ?? m.from_agent;
                    const to = getAiosAgent(m.to_agent)?.name ?? m.to_agent;
                    const ctx = Array.isArray(
                      (m.context as { julius?: unknown[] } | null)?.julius,
                    )
                      ? ((m.context as { julius: unknown[] }).julius.length as number)
                      : 0;
                    return (
                      <li key={m.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {from} → {to}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {t(`kind.${m.kind}`)}
                          </Badge>
                          <Badge variant={RISK_VARIANT[m.risk] ?? "outline"} className="text-[10px]">
                            {t(`risk.${m.risk}`)}
                          </Badge>
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            {m.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm">{m.subject}</p>
                        {m.outcome && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {t("outcomeLabel")}: {m.outcome}
                          </p>
                        )}
                        <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(m.created_at, locale)}</span>
                          {ctx > 0 && <span>· {t("ctx", { n: ctx })}</span>}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
