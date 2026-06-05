/**
 * Pure content analytics helpers. Operate on the snapshot metrics stored on
 * each content item (manual now, social-API populated later) so the analytics
 * page and tests share one implementation. No persistence / framework imports.
 */
import type { ContentItemStatus } from "./catalog";

export type ContentMetricKey =
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "impressions";

export const CONTENT_METRIC_KEYS: readonly ContentMetricKey[] = [
  "views",
  "likes",
  "comments",
  "shares",
  "impressions",
] as const;

/** Minimal shape the analytics helpers need (ContentItem satisfies it). */
export type MetricsItem = {
  id: string;
  title: string;
  status: ContentItemStatus;
} & Record<ContentMetricKey, number>;

export type ContentSummary = {
  total: number;
  published: number;
  scheduled: number;
  totals: Record<ContentMetricKey, number>;
  /** likes + comments + shares as a share of impressions, 0..1 (0 if none). */
  engagementRate: number;
  /** Highest-viewed pieces first. */
  top: MetricsItem[];
};

function zeroTotals(): Record<ContentMetricKey, number> {
  return { views: 0, likes: 0, comments: 0, shares: 0, impressions: 0 };
}

export function summarizeContent(
  items: MetricsItem[],
  topN = 5,
): ContentSummary {
  const totals = zeroTotals();
  let published = 0;
  let scheduled = 0;
  for (const it of items) {
    for (const k of CONTENT_METRIC_KEYS) totals[k] += Number(it[k]) || 0;
    if (it.status === "published") published += 1;
    if (it.status === "scheduled") scheduled += 1;
  }
  const engagements = totals.likes + totals.comments + totals.shares;
  const engagementRate =
    totals.impressions > 0 ? engagements / totals.impressions : 0;
  const top = [...items]
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
    .slice(0, Math.max(0, topN));
  return { total: items.length, published, scheduled, totals, engagementRate, top };
}
