"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Send } from "lucide-react";
import { runOperator } from "@/lib/harmony/operator-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Compact Life Operator input for the dashboard. */
export function OperatorQuickInput() {
  const t = useTranslations("operator");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    const value = input.trim();
    if (!value || pending) return;
    start(async () => {
      const res = await runOperator(value);
      setReply(res.reply);
      setInput("");
    });
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("quickPlaceholder")}
          aria-label={t("inputLabel")}
          disabled={pending}
        />
        <Button
          type="submit"
          size="icon"
          disabled={pending || !input.trim()}
          aria-label={t("send")}
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
      {reply && (
        <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
          {reply}
        </p>
      )}
      <Link
        href="/harmony/operator"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {t("openFull")}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
