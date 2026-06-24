import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getAiosAgent } from "@/lib/workforce/registry";
import { getAgentPersona } from "@/lib/workforce/agent-personas";
import { getAgentIcon } from "@/lib/workforce/agent-icons";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { listAgentMessages } from "@/lib/harmony/agents/a2a";
import { listChatMessages } from "@/lib/workforce/chat";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AgentChat } from "@/components/harmony/workforce/agent-chat";

const ACTIVE = ["open", "delegated", "in_progress", "awaiting_approval"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ agent: string }>;
}): Promise<Metadata> {
  const { agent } = await params;
  const def = getAiosAgent(agent);
  return { title: def ? `${def.name} — AIOS` : "AIOS" };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent } = await params;
  const def = getAiosAgent(agent);
  const persona = getAgentPersona(agent);
  const Icon = getAgentIcon(agent);
  if (!def || !persona || !Icon) notFound();

  const t = await getTranslations("workforce");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const [messages, chat] = await Promise.all([
    companyId ? listAgentMessages(user.id, companyId, { agent, limit: 100 }) : Promise.resolve([]),
    listChatMessages(user.id, agent, 100),
  ]);

  const sent = messages.filter((m) => m.from_agent === agent).length;
  const received = messages.filter((m) => m.to_agent === agent).length;
  const tasksCompleted = messages.filter(
    (m) => (m.from_agent === agent || m.to_agent === agent) && m.status === "completed",
  ).length;
  const connected = new Set<string>();
  for (const m of messages) {
    if (m.from_agent === agent && m.to_agent !== agent) connected.add(m.to_agent);
    if (m.to_agent === agent && m.from_agent !== agent) connected.add(m.from_agent);
  }
  const inflight = messages.find((m) => m.to_agent === agent && ACTIVE.includes(m.status));
  const lastDone = messages.find(
    (m) => (m.from_agent === agent || m.to_agent === agent) && (m.status === "completed" || m.kind === "response"),
  );
  const lastActiveTs =
    [messages[0]?.created_at, chat[chat.length - 1]?.created_at].filter(Boolean).sort().reverse()[0] ?? null;
  const status = inflight
    ? inflight.status === "awaiting_approval"
      ? "awaiting"
      : "working"
    : messages.length > 0 || chat.length > 0
      ? "online"
      : "idle";
  const juliusReferenced = chat.reduce((n, m) => {
    const j = (m.refs as { julius?: unknown[] } | null)?.julius;
    return n + (Array.isArray(j) ? j.length : 0);
  }, 0);

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    working: "default",
    awaiting: "destructive",
    online: "secondary",
    idle: "outline",
  };

  const stats: { label: string; value: number | string }[] = [
    { label: t("tasksCompleted"), value: tasksCompleted },
    { label: t("messagesSent"), value: sent },
    { label: t("messagesReceived"), value: received },
    { label: t("connectedAgents"), value: connected.size },
    { label: t("chatMessages"), value: chat.length },
    { label: t("juliusReferenced"), value: juliusReferenced },
  ];

  return (
    <>
      <PageHeader title={def.name} description={def.role}>
        <Button asChild variant="outline" size="sm">
          <Link href="/harmony/workforce">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToWorkforce")}
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        {/* Identity + live status */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-2xl border bg-muted text-foreground">
              <Icon className="size-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{def.name}</span>
                <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{def.purpose}</p>
              <div className="flex flex-wrap gap-1 pt-1">
                {persona.focus.map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("currentTask")}</p>
              <p className="mt-0.5 truncate text-sm font-medium">{inflight?.subject ?? t("none")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("lastAction")}</p>
              <p className="mt-0.5 truncate text-sm font-medium">{lastDone?.subject ?? t("none")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t("lastActive")}</p>
              <p className="mt-0.5 truncate text-sm font-medium">
                {lastActiveTs ? formatDate(lastActiveTs, locale) : t("none")}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("metrics")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Chat */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4 text-primary" aria-hidden="true" />
              {t("chatWith", { name: def.name })}
            </CardTitle>
            <CardDescription>{t("chatHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentChat
              agent={agent}
              agentName={def.name}
              messages={chat.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
