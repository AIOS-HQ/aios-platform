"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { sendMessage } from "@/lib/harmony/comms/comms-actions";
import { idleState } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LIMITS } from "@/lib/limits";

/** Compose + send an outbound reply (autonomy-gated server-side). */
export function ReplyForm({ conversationId }: { conversationId: string }) {
  const t = useTranslations("os.comms");
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");

  function onSubmit(formData: FormData) {
    start(async () => {
      const res = await sendMessage(idleState, formData);
      if (res.status === "error") {
        toast.error(res.message ?? "");
        return;
      }
      toast.success(res.message ?? "");
      setValue("");
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-2">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <Textarea
        name="body"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={LIMITS.noteContent}
        rows={3}
        placeholder={t("replyPlaceholder")}
        aria-label={t("reply")}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || value.trim() === ""}>
          <Send className="size-4" aria-hidden="true" />
          {t("send")}
        </Button>
      </div>
    </form>
  );
}
