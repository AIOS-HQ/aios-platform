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
 * and Harmony decides. Panels are kept mounted (toggled via `hidden`) so the
 * chat conversation is preserved when switching tabs.
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

  return (
    <div>
      <div role="tablist" aria-label="Harmony" className="mb-4 flex gap-1 border-b">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
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

      <div className={cn(tab !== "chat" && "hidden")}>{chat}</div>
      <div className={cn(tab !== "suggestions" && "hidden")}>{suggestions}</div>
      <div className={cn(tab !== "memory" && "hidden")}>{memory}</div>
    </div>
  );
}
