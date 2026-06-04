"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Send, X } from "lucide-react";
import {
  confirmOperatorAction,
  runOperator,
} from "@/lib/harmony/operator-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { OperatorResult } from "@/lib/ai/types";

/** Compact Life Operator input for the dashboard (with confirm-before-write). */
export function OperatorQuickInput() {
  const t = useTranslations("operator");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [proposed, setProposed] = useState<
    OperatorResult["proposedAction"] | null
  >(null);
  const [pending, start] = useTransition();

  function send() {
    const value = input.trim();
    if (!value || pending) return;
    start(async () => {
      const res = await runOperator(value);
      setReply(res.reply);
      setProposed(res.proposedAction ?? null);
      setInput("");
    });
  }

  function confirm() {
    if (!proposed || pending) return;
    const p = proposed;
    start(async () => {
      const res = await confirmOperatorAction(p.type, p.title);
      setReply(res.reply);
      setProposed(null);
    });
  }

  function cancel() {
    setProposed(null);
    setReply(t("cancelled"));
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
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <p className="whitespace-pre-wrap text-sm">{reply}</p>
          {proposed && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={confirm} disabled={pending}>
                <Check className="size-3.5" aria-hidden="true" />
                {t("confirm")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancel}
                disabled={pending}
              >
                <X className="size-3.5" aria-hidden="true" />
                {t("cancel")}
              </Button>
            </div>
          )}
        </div>
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
