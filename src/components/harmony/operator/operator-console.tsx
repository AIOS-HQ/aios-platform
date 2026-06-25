"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, CheckCircle2, Copy, Send, X } from "lucide-react";
import {
  confirmOperatorAction,
  loadOperatorMessages,
  runOperator,
} from "@/lib/harmony/operator-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HarmonyAvatar } from "@/components/brand/harmony-logo";
import { cn } from "@/lib/utils";
import type { OperatorResult } from "@/lib/ai/types";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: OperatorResult["actionTaken"];
  proposed?: OperatorResult["proposedAction"];
  resolved?: boolean;
};

/** Distance (px) from the bottom within which we consider the user "following" live. */
const BOTTOM_THRESHOLD = 80;

/**
 * The canonical Harmony chat. One implementation, shared across founder,
 * personal, business, and enterprise experiences. Harmony — the AI Chief of
 * Staff — owns the conversation; the canonical Harmony avatar is shown beside
 * every reply and while she thinks (the avatar is Harmony's interaction
 * identity — never the brand wordmark inside a conversation).
 */
export function OperatorConsole({ isMock }: { isMock: boolean }) {
  const t = useTranslations("operator");
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the user is pinned to the bottom (following the live conversation).
   * We only auto-scroll when this is true, so reviewing older messages is never
   * interrupted by background refreshes or incoming replies.
   */
  const atBottomRef = useRef(true);

  function isNearBottom(el: HTMLDivElement): boolean {
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }

  function handleScroll() {
    const el = listRef.current;
    if (el) atBottomRef.current = isNearBottom(el);
  }

  /** Jump to the newest message — used for active (user-initiated) conversation. */
  function scrollToBottom() {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }

  // Background refresh: poll for messages, but DON'T disturb the user's scroll
  // position. We capture whether they were at the bottom before applying updates
  // and only restore the pinned-to-bottom position if they were.
  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const loaded = await loadOperatorMessages();
        if (active) {
          setMessages(loaded as Msg[]);
          router.refresh();
        }
      } catch {}
    };

    refresh();
    const interval = setInterval(refresh, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [router]);

  // Auto-scroll ONLY when the user is following the live conversation (pinned to
  // bottom). If they have scrolled up to review history, leave their view alone.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, pending]);

  const examples = [
    t("examples.task"),
    t("examples.goal"),
    t("examples.summarize"),
    t("examples.next"),
  ];

  function send(text: string) {
    const value = text.trim();
    if (!value || pending) return;
    // The user is actively conversing — pin to bottom so their message shows.
    atBottomRef.current = true;
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text: value },
    ]);
    setInput("");
    start(async () => {
      const res = await runOperator(value);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: res.reply,
          action: res.actionTaken,
          proposed: res.proposedAction,
        },
      ]);
    });
  }

  function confirmProposal(
    msgId: string,
    proposed: NonNullable<OperatorResult["proposedAction"]>,
  ) {
    if (pending) return;
    atBottomRef.current = true;
    setMessages((m) =>
      m.map((x) => (x.id === msgId ? { ...x, resolved: true } : x)),
    );
    start(async () => {
      const res = await confirmOperatorAction(proposed.type, proposed.title);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: res.reply,
          action: res.actionTaken,
        },
      ]);
    });
  }

  function cancelProposal(msgId: string) {
    atBottomRef.current = true;
    setMessages((m) =>
      m.map((x) => (x.id === msgId ? { ...x, resolved: true } : x)),
    );
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "assistant", text: t("cancelled") },
    ]);
  }

  function copy(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(t("copied")))
      .catch(() => {});
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col rounded-xl border bg-card">
      {isMock && (
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <HarmonyAvatar className="size-3.5 shrink-0" />
          {t("mockBanner")}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <HarmonyAvatar className="size-9" title="Harmony" />
            </span>
            <div className="space-y-1">
              <p className="font-medium">{t("emptyTitle")}</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                {t("emptyBody")}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(ex)}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex items-start gap-2",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {m.role === "assistant" && (
                <HarmonyAvatar
                  className="mt-0.5 size-6 shrink-0"
                  title="Harmony"
                />
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>

                {m.action && (
                  <span className="mt-1.5 flex items-center gap-1 text-xs opacity-80">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    {m.action.label}
                  </span>
                )}

                {m.proposed && !m.resolved && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => confirmProposal(m.id, m.proposed!)}
                      disabled={pending}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      {t("confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelProposal(m.id)}
                      disabled={pending}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      {t("cancel")}
                    </Button>
                  </div>
                )}

                {m.role === "assistant" && !m.proposed && (
                  <button
                    type="button"
                    onClick={() => copy(m.text)}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t("copy")}
                  >
                    <Copy className="size-3" aria-hidden="true" />
                    {t("copy")}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {pending && (
          <div className="flex items-start gap-2">
            <HarmonyAvatar className="mt-0.5 size-6 shrink-0" title="Harmony" />
            <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
              {t("thinking")}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("placeholder")}
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
    </div>
  );
}
