"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sendAgentChatAction } from "@/lib/workforce/chat-actions";
import { idleState } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { WorkerAvatar } from "@/components/workforce/worker-avatar";
import { ChatAttachButton } from "@/components/uploads/chat-attach-button";
import { LIMITS } from "@/lib/limits";

export interface ChatTurn {
  id: string;
  role: string;
  content: string;
}

/**
 * Founder ↔ agent chat. Server-rendered history + a composer that posts to the
 * advisory chat action; on success the page revalidates so the new turns appear.
 * Agent turns are marked with the canonical WorkerAvatar so the worker's
 * identity is consistent with the rest of the platform. The "+" attaches a file
 * or context, appended to the message so it travels with the turn.
 */
export function AgentChat({
  agent,
  agentName,
  messages,
}: {
  agent: string;
  agentName: string;
  messages: ChatTurn[];
}) {
  const t = useTranslations("workforce");
  const [state, action] = useActionState(sendAgentChatAction, idleState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatEmpty", { name: agentName })}</p>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="mr-auto flex max-w-[85%] items-start gap-2">
                <WorkerAvatar agent={agent} size="xs" className="mt-0.5" title={agentName} />
                <div className="whitespace-pre-wrap rounded-lg border bg-card px-3 py-2 text-sm">
                  {m.content}
                </div>
              </div>
            ),
          )
        )}
      </div>
      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="agent" value={agent} />
        <FormMessage state={state} />
        <Textarea
          ref={textareaRef}
          name="message"
          rows={2}
          maxLength={LIMITS.noteContent}
          placeholder={t("chatPlaceholder", { name: agentName })}
          required
        />
        <div className="flex items-center justify-between gap-2">
          <ChatAttachButton
            onAttach={(reference) => {
              const ta = textareaRef.current;
              if (!ta) return;
              ta.value = ta.value ? `${ta.value}\n\n${reference}` : reference;
              ta.focus();
            }}
          />
          <SubmitButton pendingLabel={t("chatSending")}>{t("chatSend")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
