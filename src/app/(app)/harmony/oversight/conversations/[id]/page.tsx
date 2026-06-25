import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  GraduationCap,
  HelpCircle,
  Send,
  UserCog,
  X,
} from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { getConversation } from "@/lib/data/comms/conversations";
import { getChannel } from "@/lib/data/comms/channels";
import { listMessages } from "@/lib/data/comms/messages";
import { listAllAgents } from "@/lib/data/os/agents";
import { approveMessage, assignConversation } from "@/lib/harmony/comms/comms-actions";
import {
  ownerReply,
  editPendingMessage,
  cancelPendingMessage,
  takeOverConversation,
  resumeConversation,
  escalateConversation,
  teachHarmony,
  TEACH_CATEGORIES,
} from "@/lib/harmony/oversight/oversight-actions";
import { explainConversation } from "@/lib/harmony/oversight/explain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ActionButton } from "@/components/shared/action-button";
import type { ConversationStatus } from "@/types/database";

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

const selectClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const statusVariant: Record<ConversationStatus, "default" | "secondary" | "outline" | "success"> = {
  open: "default",
  pending: "secondary",
  snoozed: "outline",
  closed: "success",
};

/**
 * Conversation supervision detail — the owner watches the thread and intervenes
 * (take over, reply directly, edit/cancel a pending response, reassign,
 * escalate), teaches Harmony a rule (→ Julius), and sees grounded reasoning.
 * Every action is audited through emitActivity. Founder-only via the layout.
 */
export default async function OversightConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("oversight");
  const tk = await getTranslations("os.channelKind");
  const tm = await getTranslations("os.messageStatus");
  const ts = await getTranslations("os.conversationStatus");
  const locale = await getLocale();
  const user = await requireUser();
  const companyId = await resolvePrimaryCompanyId();

  const conversation = await getConversation(id);
  if (!conversation) notFound();

  const [channel, messages, agents] = await Promise.all([
    getChannel(conversation.channel_id),
    listMessages(conversation.id),
    listAllAgents(),
  ]);
  const explanation = await explainConversation({
    userId: user.id,
    companyId,
    conversation,
    messages,
    agents,
  });

  const activeAgents = agents.filter((a) => a.status === "active");
  const assignedName = conversation.assigned_agent_id
    ? agents.find((a) => a.id === conversation.assigned_agent_id)?.name ?? null
    : null;

  return (
    <>
      <Link
        href="/harmony/oversight/conversations"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("detail.back")}
      </Link>

      <PageHeader
        title={conversation.contact}
        description={conversation.subject ?? (channel ? tk(channel.kind) : undefined)}
      >
        <Badge variant={statusVariant[conversation.status]}>{ts(conversation.status)}</Badge>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Thread + reply */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("detail.thread")}</CardTitle>
            {channel && <Badge variant="outline">{tk(channel.kind)}</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noMessages")}</p>
            ) : (
              <ul className="space-y-3">
                {messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  const pending = outbound && m.status === "awaiting_approval";
                  return (
                    <li key={m.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg border p-3",
                          outbound ? "bg-primary/5" : "bg-muted",
                        )}
                      >
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {outbound ? t("detail.harmony") : t("detail.customer")}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm">{m.body}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {tm(m.status)} · {formatDate(m.created_at, locale)}
                        </p>

                        {pending && (
                          <div className="mt-2 space-y-2 border-t pt-2">
                            <div className="flex flex-wrap gap-1.5">
                              <ActionButton
                                action={approveMessage}
                                fields={{ id: m.id }}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                successMessage={t("intervene.sent")}
                              >
                                <Check className="size-3" aria-hidden="true" />
                                {t("intervene.approveSend")}
                              </ActionButton>
                              <ActionButton
                                action={cancelPendingMessage}
                                fields={{ id: m.id }}
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                successMessage={t("intervene.cancelled")}
                              >
                                <X className="size-3" aria-hidden="true" />
                                {t("intervene.cancelPending")}
                              </ActionButton>
                            </div>
                            <details>
                              <summary className="cursor-pointer text-xs text-muted-foreground">
                                {t("intervene.editPending")}
                              </summary>
                              <form action={editPendingMessage} className="mt-2 space-y-2">
                                <input type="hidden" name="id" value={m.id} />
                                <Textarea name="body" rows={3} defaultValue={m.body} />
                                <Button type="submit" size="sm" variant="outline">
                                  {t("intervene.saveEdit")}
                                </Button>
                              </form>
                            </details>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Reply directly (owner takeover send) */}
            <form action={ownerReply} className="space-y-2 border-t pt-3">
              <input type="hidden" name="conversation_id" value={conversation.id} />
              <p className="text-xs font-medium">{t("intervene.reply")}</p>
              <Textarea name="body" rows={3} placeholder={t("intervene.replyPlaceholder")} />
              <div className="flex justify-end">
                <Button type="submit" size="sm">
                  <Send className="size-4" aria-hidden="true" />
                  {t("intervene.send")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Intervene / Teach / Explain */}
        <div className="space-y-6">
          {/* Intervene */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCog className="size-4 text-primary" aria-hidden="true" />
                {t("intervene.title")}
              </CardTitle>
              <CardDescription>{t("intervene.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {assignedName
                  ? t("detail.assignedTo", { name: assignedName })
                  : t("detail.unassigned")}
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={takeOverConversation} fields={{ id: conversation.id }} size="sm" variant="outline" successMessage={t("intervene.tookOver")}>
                  {t("intervene.takeOver")}
                </ActionButton>
                <ActionButton action={resumeConversation} fields={{ id: conversation.id }} size="sm" variant="outline" successMessage={t("intervene.resumed")}>
                  {t("intervene.resume")}
                </ActionButton>
                <ActionButton action={escalateConversation} fields={{ id: conversation.id }} size="sm" variant="outline" successMessage={t("intervene.escalated")}>
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {t("intervene.escalate")}
                </ActionButton>
              </div>
              <form action={assignConversation} className="space-y-2 border-t pt-3">
                <input type="hidden" name="id" value={conversation.id} />
                <label className="text-xs font-medium" htmlFor="reassign-agent">
                  {t("intervene.reassign")}
                </label>
                <select
                  id="reassign-agent"
                  name="agent_id"
                  defaultValue={conversation.assigned_agent_id ?? "none"}
                  className={selectClass}
                >
                  <option value="none">{t("detail.unassigned")}</option>
                  {activeAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="outline">
                  {t("intervene.reassignButton")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Teach Harmony */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                {t("teach.title")}
              </CardTitle>
              <CardDescription>{t("teach.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={teachHarmony} className="space-y-2">
                <Textarea name="instruction" rows={3} placeholder={t("teach.placeholder")} />
                <label className="text-xs font-medium" htmlFor="teach-category">
                  {t("teach.category.label")}
                </label>
                <select id="teach-category" name="category" defaultValue="operational_guideline" className={selectClass}>
                  {TEACH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`teach.category.${c}`)}</option>
                  ))}
                </select>
                <Button type="submit" size="sm">{t("teach.save")}</Button>
              </form>
            </CardContent>
          </Card>

          {/* Explain Why */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HelpCircle className="size-4 text-primary" aria-hidden="true" />
                {t("explain.title")}
              </CardTitle>
              <CardDescription>{t("explain.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {explanation.held ? t("explain.held") : t("explain.notHeld")}
              </p>
              <p className="text-muted-foreground">
                {explanation.assignedAgent
                  ? t("explain.assigned", { name: explanation.assignedAgent })
                  : t("explain.unassigned")}
              </p>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("explain.knowledge")}
                </p>
                {explanation.knowledge.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("explain.noKnowledge")}</p>
                ) : (
                  <ul className="space-y-2">
                    {explanation.knowledge.map((k) => (
                      <li key={k.id} className="rounded-lg border p-2">
                        <p className="text-xs font-medium">{k.title}</p>
                        <p className="text-xs text-muted-foreground">{k.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{t("explain.grounded")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
