"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sendAgentChatAction } from "@/lib/workforce/chat-actions";
import { idleState } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { LIMITS } from "@/lib/limits";

export interface ChatTurn {
  id: string;
  role: string;
  content: string;
}

/**
 * Founder ↔ agent chat. Server-rendered history + a composer that posts to the
 * advisory chat action; on success the page revalidates so the new turns appear.
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
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[85%] whitespace-pre-wrap rounded-lg border bg-card px-3 py-2 text-sm"
              }
            >
              {m.content}
            </div>
          ))
        )}
      </div>
      <form ref={formRef} action={action} className="space-y-2">
        <input type="hidden" name="agent" value={agent} />
        <FormMessage state={state} />
        <Textarea
          name="message"
          rows={2}
          maxLength={LIMITS.noteContent}
          placeholder={t("chatPlaceholder", { name: agentName })}
          required
        />
        <div className="flex justify-end">
          <SubmitButton pendingLabel={t("chatSending")}>{t("chatSend")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
