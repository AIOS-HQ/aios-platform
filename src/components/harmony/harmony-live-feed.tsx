"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HarmonyMark } from "@/components/brand/harmony-logo";
import { cn } from "@/lib/utils";

export type FeedAudience = "customer" | "founder";
export type FeedTone = "status" | "feature" | "benefit" | "alert";
export type FeedItem = {
  label: string;
  title: string;
  body: string;
  tone: FeedTone;
  href?: string;
};

const toneIcon = {
  status: CheckCircle2,
  feature: Sparkles,
  benefit: ShieldCheck,
  alert: CircleAlert,
} satisfies Record<FeedTone, typeof Bell>;

const toneDestination: Record<FeedTone, string> = {
  status: "/help",
  feature: "/features",
  benefit: "/pricing",
  alert: "/help",
};

/**
 * Shared, manually controlled Harmony announcement feed.
 *
 * It intentionally has no timer: content never advances while somebody is
 * reading it, so no pause control is necessary. Critical alerts are sorted to
 * the front without changing their localized source order otherwise.
 */
export function HarmonyLiveFeed({
  audience = "customer",
  items,
  variant = "entrance",
  linkLabel,
  statusLabel,
}: {
  audience?: FeedAudience;
  items?: FeedItem[];
  variant?: "entrance" | "authenticated";
  linkLabel?: string;
  statusLabel?: string;
}) {
  const t = useTranslations("auth.executive.feed");
  const titleId = useId();
  const sourceItems = items ?? (t.raw(audience) as FeedItem[]);
  const sorted = useMemo(
    () => [...sourceItems].sort((a, b) => Number(b.tone === "alert") - Number(a.tone === "alert")),
    [sourceItems],
  );
  const [index, setIndex] = useState(0);
  const item = sorted[index] ?? sorted[0];
  const Icon = toneIcon[item?.tone ?? "status"];
  const total = sorted.length;

  function previous() {
    setIndex((current) => (current === 0 ? total - 1 : current - 1));
  }

  function next() {
    setIndex((current) => (current + 1) % total);
  }

  return (
    <section
      className={cn(
        variant === "entrance"
          ? "auth-feed auth-executive-panel"
          : "app-feed app-surface",
      )}
      aria-labelledby={titleId}
      data-audience={audience}
    >
      <div className="auth-feed__art" aria-hidden="true">
        <span className="auth-feed__orbit auth-feed__orbit--outer" />
        <span className="auth-feed__orbit auth-feed__orbit--inner" />
        <HarmonyMark className="auth-feed__mark" />
        <span className="auth-feed__pulse" />
      </div>

      <div className="auth-feed__story" aria-live="polite">
        <p className="auth-kicker" id={titleId}>
          <span className="auth-live-dot" aria-hidden="true" />
          {t("label")}
        </p>
        <h2>{item?.title}</h2>
        <p className="auth-feed__body">{item?.body}</p>
        <Link
          href={item?.href ?? toneDestination[item?.tone ?? "status"]}
          className="auth-inline-link"
        >
          {linkLabel ?? t("learnMore")}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>

      <div className="auth-feed__announcement">
        <div className="auth-feed__announcement-label">
          <span
            className={cn(
              "auth-feed__announcement-icon",
              item?.tone === "alert" && "auth-feed__announcement-icon--alert",
            )}
          >
            <Icon aria-hidden="true" />
          </span>
          <span>{t("announcement")}</span>
        </div>
        <p className="auth-feed__announcement-category">{item?.label}</p>
        <p className="auth-feed__announcement-title">{item?.title}</p>
      </div>

      <div className="auth-feed__controls">
        <div className="auth-feed__buttons">
          <button type="button" onClick={previous} aria-label={t("previous")}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" onClick={next} aria-label={t("next")}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <p className="auth-feed__position">
          {t("position", { current: index + 1, total })}
        </p>
        <p className="auth-feed__status">
          <span aria-hidden="true" />
          {statusLabel ?? t("operational")}
        </p>
      </div>
    </section>
  );
}
