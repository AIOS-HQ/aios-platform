import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MessageSquare, Plug, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listChannels } from "@/lib/data/comms/channels";
import { listConversations } from "@/lib/data/comms/conversations";
import { listAwaitingApprovalMessages } from "@/lib/data/comms/messages";
import { listCompanies } from "@/lib/data/os/companies";
import { listDepartments } from "@/lib/data/os/departments";
import { getChannelTemplate } from "@/lib/harmony/comms/catalog";
import {
  setChannelConnected,
  deleteChannel,
} from "@/lib/harmony/comms/comms-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEmpty } from "@/components/shared/inline-empty";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/harmony/confirm-delete-dialog";
import { ActionButton } from "@/components/shared/action-button";
import { ChannelDialog } from "@/components/harmony/comms/channel-dialog";
import { ConversationDialog } from "@/components/harmony/comms/conversation-dialog";
import { DiscoveredConnectors } from "@/components/integrations/discovered-connectors";
import type { ConversationStatus } from "@/types/database";

const convStatusVariant: Record<
  ConversationStatus,
  "default" | "secondary" | "outline" | "success"
> = {
  open: "default",
  pending: "secondary",
  snoozed: "outline",
  closed: "success",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.comms");
  return { title: t("title") };
}

export default async function CommsPage() {
  const t = await getTranslations("os.comms");
  const tk = await getTranslations("os.channelKind");
  const ts = await getTranslations("os.conversationStatus");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  await requireUser();

  const [channels, conversations, companies, departments, pendingMsgs] =
    await Promise.all([
      listChannels(),
      listConversations(),
      listCompanies(),
      listDepartments(),
      listAwaitingApprovalMessages(),
    ]);
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const pendingByConversation = new Map<string, number>();
  for (const m of pendingMsgs) {
    pendingByConversation.set(
      m.conversation_id,
      (pendingByConversation.get(m.conversation_id) ?? 0) + 1,
    );
  }
  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));
  const deptOpts = departments.map((d) => ({ id: d.id, name: d.name, company_id: d.company_id }));
  const channelOpts = channels.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <ChannelDialog companies={companyOpts} departments={deptOpts}>
          <Button variant="outline">
            <Plug className="size-4" aria-hidden="true" />
            {t("addChannel")}
          </Button>
        </ChannelDialog>
        {channels.length > 0 && (
          <ConversationDialog channels={channelOpts}>
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              {t("newConversation")}
            </Button>
          </ConversationDialog>
        )}
      </PageHeader>

      <DiscoveredConnectors kind="channels" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Channels */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="size-4 text-primary" aria-hidden="true" />
              {t("channels")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <InlineEmpty icon={Plug} message={t("noChannels")} />
            ) : (
              <ul className="space-y-2">
                {channels.map((ch) => {
                  const tmpl = getChannelTemplate(ch.kind);
                  const connected = ch.status === "connected";
                  return (
                    <li key={ch.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{ch.name}</span>
                            <Badge variant={connected ? "success" : "outline"} className="shrink-0">
                              {connected ? t("connected") : t("disconnected")}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {tk(ch.kind)}
                            {ch.handle ? ` · ${ch.handle}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <ActionButton
                            action={setChannelConnected}
                            fields={{ id: ch.id, connected: connected ? "false" : "true" }}
                            size="sm"
                            variant={connected ? "outline" : "secondary"}
                            successMessage={connected ? t("disconnected") : t("connected")}
                          >
                            {connected ? t("disconnect") : t("connect")}
                          </ActionButton>
                          <ConfirmDeleteDialog action={deleteChannel} id={ch.id} itemTitle={ch.name}>
                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label={tc("delete")}>
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </ConfirmDeleteDialog>
                        </div>
                      </div>
                      {tmpl?.requiresCredentials && !connected && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("needs")}: {tmpl.setup}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Inbox */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-4 text-primary" aria-hidden="true" />
              {t("inbox")}
              {pendingMsgs.length > 0 && (
                <Badge variant="warning" className="ml-auto">
                  {pendingMsgs.length} · {t("pendingApproval")}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <EmptyState
                icon={Plug}
                title={t("empty.title")}
                description={t("empty.description")}
              />
            ) : conversations.length === 0 ? (
              <InlineEmpty icon={MessageSquare} message={t("noConversations")} />
            ) : (
              <ul className="divide-y">
                {conversations.map((cv) => (
                  <li key={cv.id}>
                    <Link
                      href={`/harmony/comms/${cv.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{cv.contact}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {channelName.get(cv.channel_id) ?? ""}
                          {cv.subject ? ` · ${cv.subject}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {(pendingByConversation.get(cv.id) ?? 0) > 0 && (
                          <Badge variant="warning">{t("pendingApproval")}</Badge>
                        )}
                        <Badge variant={convStatusVariant[cv.status]}>{ts(cv.status)}</Badge>
                        {cv.last_message_at && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(cv.last_message_at, locale)}
                          </span>
                        )}
                      </div>
                    </Link>
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
