import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Check } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { canUseDiagnostics } from "@/lib/auth/roles";
import { getConversation } from "@/lib/data/comms/conversations";
import { getChannel } from "@/lib/data/comms/channels";
import { listMessages } from "@/lib/data/comms/messages";
import {
  approveMessage,
  setConversationStatus,
  simulateInbound,
} from "@/lib/harmony/comms/comms-actions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReplyForm } from "@/components/harmony/comms/reply-form";
import { ActionButton } from "@/components/shared/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await requireUser();
  const conv = await getConversation(id);
  return { title: conv?.contact ?? "Conversation" };
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("os.comms");
  const tk = await getTranslations("os.channelKind");
  const tm = await getTranslations("os.messageStatus");
  await requireUser();
  const locale = await getLocale();

  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const [channel, messages, showSimulate] = await Promise.all([
    getChannel(conversation.channel_id),
    listMessages(conversation.id),
    canUseDiagnostics(),
  ]);
  const isClosed = conversation.status === "closed";

  return (
    <>
      <Link
        href="/harmony/comms"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToComms")}
      </Link>

      <PageHeader
        title={conversation.contact}
        description={conversation.subject ?? (channel ? tk(channel.kind) : undefined)}
      >
        <ActionButton
          action={setConversationStatus}
          fields={{ id: conversation.id, status: isClosed ? "open" : "closed" }}
          variant="outline"
        >
          {isClosed ? t("reopen") : t("close")}
        </ActionButton>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("thread")}</CardTitle>
            {channel && <Badge variant="outline">{tk(channel.kind)}</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noMessages")}</p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  return (
                    <li
                      key={m.id}
                      className={cn("flex", outbound ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg border p-3",
                          outbound ? "bg-primary/5" : "bg-muted",
                        )}
                      >
                        <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {tm(m.status)} · {formatDate(m.created_at, locale)}
                          </span>
                          {outbound && m.status === "awaiting_approval" && (
                            <ActionButton
                              action={approveMessage}
                              fields={{ id: m.id }}
                              size="sm"
                              className="h-6 px-2 text-xs"
                              successMessage={t("sent")}
                            >
                              <Check className="size-3" aria-hidden="true" />
                              {t("approveSend")}
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!isClosed && <ReplyForm conversationId={conversation.id} />}
          </CardContent>
        </Card>

        {showSimulate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("simulate")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-muted-foreground">{t("simulateHint")}</p>
              <form action={simulateInbound} className="space-y-2">
                <input type="hidden" name="conversation_id" value={conversation.id} />
                <Textarea name="body" rows={3} placeholder={t("simulatePlaceholder")} />
                <div className="flex justify-end">
                  <Button type="submit" variant="outline" size="sm">
                    {t("simulateButton")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
