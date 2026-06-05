import { describe, it, expect } from "vitest";
import {
  CONTENT_FORMATS,
  CONTENT_ITEM_STATUSES,
  isContentFormat,
  isContentItemStatus,
} from "@/lib/harmony/content/catalog";
import {
  CONTENT_METRIC_KEYS,
  summarizeContent,
  type MetricsItem,
} from "@/lib/harmony/content/insights";

describe("content calendar catalog", () => {
  it("defines seven formats and validates them", () => {
    expect(CONTENT_FORMATS).toHaveLength(7);
    expect(isContentFormat("youtube_video")).toBe(true);
    expect(isContentFormat("podcast")).toBe(false);
  });

  it("defines the six calendar statuses idea→archived", () => {
    expect(CONTENT_ITEM_STATUSES).toEqual([
      "idea",
      "planned",
      "scripted",
      "scheduled",
      "published",
      "archived",
    ]);
    expect(isContentItemStatus("published")).toBe(true);
    expect(isContentItemStatus("nope")).toBe(false);
  });
});

describe("content analytics summary", () => {
  const items: MetricsItem[] = [
    { id: "a", title: "A", status: "published", views: 100, likes: 10, comments: 5, shares: 5, impressions: 200 },
    { id: "b", title: "B", status: "scheduled", views: 50, likes: 0, comments: 0, shares: 0, impressions: 100 },
    { id: "c", title: "C", status: "idea", views: 200, likes: 0, comments: 0, shares: 0, impressions: 0 },
  ];

  it("tracks the five metric keys", () => {
    expect(CONTENT_METRIC_KEYS).toEqual([
      "views",
      "likes",
      "comments",
      "shares",
      "impressions",
    ]);
  });

  it("aggregates totals, counts, and engagement rate", () => {
    const s = summarizeContent(items);
    expect(s.total).toBe(3);
    expect(s.published).toBe(1);
    expect(s.scheduled).toBe(1);
    expect(s.totals.views).toBe(350);
    expect(s.totals.impressions).toBe(300);
    // (10 + 5 + 5) / 300
    expect(s.engagementRate).toBeCloseTo(20 / 300, 5);
  });

  it("ranks top performers by views", () => {
    const s = summarizeContent(items, 2);
    expect(s.top.map((i) => i.id)).toEqual(["c", "a"]);
  });

  it("handles an empty set without dividing by zero", () => {
    const s = summarizeContent([]);
    expect(s.total).toBe(0);
    expect(s.engagementRate).toBe(0);
    expect(s.top).toEqual([]);
  });
});
