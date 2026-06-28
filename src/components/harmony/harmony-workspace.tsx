"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BrainCircuit, Lightbulb, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "chat" | "suggestions" | "memory";

/**
 * One Harmony experience. A single interface with Chat / Suggestions / Memory —
 * the consolidation of the former Life Operator, Life Advisor, and Personal
 * Brain. The customer never chooses which AI to use; they work with Harmony,
 * and Harmony decides. Panels are kept mounted (toggled via the `hidden`
 * attribute) so the chat conversation is preserved when switching tabs.
 *
 * Implements the WAI-ARIA Tabs pattern: a roving tabindex over the `tab`
 * buttons, Arrow/Home/End keyboard navigation, and `tabpanel`s wired to their
 * tab via `aria-controls`/`aria-labelledby`.
 */
export function HarmonyWorkspace({
  chat,
  suggestions,
  memory,
  initialTab = "chat",
}: {
  chat: React.ReactNode;
  suggestions: React.ReactNode;
  memory: React.ReactNode;
  initialTab?: Tab;
}) {
  const t = useTranslations("operator.tabs");
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs: { key: Tab; label: string; icon: typeof MessageSquare }[] = [
    { key: "chat", label: t("chat"), icon: MessageSquare },
    { key: "suggestions", label: t("suggestions"), icon: Lightbulb },
    { key: "memory", label: t("memory"), icon: BrainCircuit },
  ];

  const panels: { key: Tab; node: React.ReactNode }[] = [
    { key: "chat", node: chat },
    { key: "suggestions", node: suggestions },
    { key: "memory", node: memory },
  ];

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const idx = tabs.findIndex((x) => x.key === tab);
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (idx + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (idx - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextKey = tabs[next].key;
    setTab(nextKey);
    document.getElementById(`harmony-tab-${nextKey}`)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Harmony"
        className="mb-4 flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`harmony-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`harmony-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={onTabKeyDown}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {panels.map(({ key, node }) => (
        <div
          key={key}
          role="tabpanel"
          id={`harmony-panel-${key}`}
          aria-labelledby={`harmony-tab-${key}`}
          hidden={tab !== key}
        >
          {node}
        </div>
      ))}
    </div>
  );
}
