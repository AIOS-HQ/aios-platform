import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listConversations } from "@/lib/data/comms/conversations";
import { listChannels } from "@/lib/data/comms/channels";
import { listAllAgents } from "@/lib/data/os/agents";
import { listAwaitingApprovalMessages } from "@/lib/data/comms/messages";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConversationStatus } from "@/types/database";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("oversight");
  return { title: t("supervision.title") };
}

const statusVariant: Record<ConversationStatus, "default" | "secondary" | "outline" | "success"> = {
  open: "default",
  pending: "secondary",
  snoozed: "outline",
  closed: "success",
};

/**
 * Live Conversation Supervision — every channel's conversations in one founder
 * view. Reads the existing comms data; each row links to the supervision detail
 * where the owner can intervene, teach, and see grounded reasoning.
 */
export default async function OversightConversationsPage() {
  const t = await getTranslations("oversight");
  const tk = await getTranslations("os.channelKind");
  const ts = await getTranslations("os.conversationStatus");
  const locale = await getLocale();
  await requireUser();

  const [conversations, channels, agents, awaiting] = await Promise.all([
    listConversations(),
    listChannels(),
    listAllAgents(),
    listAwaitingApprovalMessages(),
  ]);

  const channelKind = new Map(channels.map((c) => [c.id, c.kind]));
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const heldByConversation = new Set(awaiting.map((m) => m.conversation_id));

  return (
    <>
      <Link
        href="/harmony/oversight"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("supervision.back")}
      </Link>

      <PageHeader title={t("supervision.title")} description={t("supervision.subtitle")} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" />
            {t("supervision.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={t("supervision.none")}
              description={t("conversations.body")}
            />
          ) : (
            <ul className="divide-y">
              {conversations.map((cv) => {
                const kind = channelKind.get(cv.channel_id);
                const assigned = cv.assigned_agent_id ? agentName.get(cv.assigned_agent_id) : null;
                const held = heldByConversation.has(cv.id);
                return (
                  <li key={cv.id}>
                    <Link
                      href={`/harmony/oversight/conversations/${cv.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{cv.contact}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {kind ? tk(kind) : ""}
                          {cv.subject ? ` · ${cv.subject}` : ""}
                          {assigned ? ` · ${t("supervision.assigned", { name: assigned })}` : ` · ${t("supervision.unassigned")}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {held && <Badge variant="warning">{t("supervision.held")}</Badge>}
                        <Badge variant={statusVariant[cv.status]}>{ts(cv.status)}</Badge>
                        {cv.last_message_at && (
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {formatDate(cv.last_message_at, locale)}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
