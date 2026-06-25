"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  loadHarmonyActivity,
  type HarmonyActivityItem,
} from "@/lib/harmony/collaboration";
import { getAgentIcon } from "@/lib/workforce/agent-icons";
import { HarmonyMark } from "@/components/brand/harmony-logo";

/**
 * Harmony Live Orchestration strip — Harmony narrates the genuine collaboration
 * happening across her specialists (real A2A events from `loadHarmonyActivity`).
 * Harmony is the speaker ("Harmony is coordinating"); specialists are shown doing
 * actual work. Renders nothing when there is no real activity.
 */
export function HarmonyCollaboration() {
  const t = useTranslations("operator.collab");
  const [items, setItems] = useState<HarmonyActivityItem[]>([]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await loadHarmonyActivity();
        if (active) setItems(next);
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;

  const verb = (status: string): string => {
    if (status === "completed") return t("completed");
    if (status === "blocked") return t("blocked");
    if (status === "awaiting_approval") return t("awaiting");
    return t("working");
  };

  return (
    <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <HarmonyMark className="size-4" title="Harmony" />
        {t("coordinating")}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.slice(0, 5).map((it) => {
          const Icon = getAgentIcon(it.agentKey);
          return (
            <li
              key={it.id}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              <span className="font-medium text-foreground">{it.agentName}</span>
              <span>{verb(it.status)}</span>
              <span className="truncate">{it.subject}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
