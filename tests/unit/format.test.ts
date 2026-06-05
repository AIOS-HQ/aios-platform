import { describe, it, expect, afterEach, vi } from "vitest";
import { formatDate, daysUntil, timeOfDay, daysSince } from "@/lib/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDate", () => {
  it("returns an empty string for nullish or empty input", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDate("not-a-date")).toBe("");
  });

  it("formats a date-only ISO string in en locale", () => {
    expect(formatDate("2026-06-04", "en")).toBe("Jun 4, 2026");
  });
});

describe("daysUntil", () => {
  it("returns null for nullish input", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil(undefined)).toBeNull();
  });

  it("returns 0 for today, positive for future, negative for past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T08:30:00"));
    expect(daysUntil("2026-06-04")).toBe(0);
    expect(daysUntil("2026-06-07")).toBe(3);
    expect(daysUntil("2026-06-01")).toBe(-3);
  });
});

describe("timeOfDay", () => {
  it("buckets the hour into morning/afternoon/evening for a timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T09:00:00Z"));
    expect(timeOfDay("UTC")).toBe("morning");
    vi.setSystemTime(new Date("2026-06-04T14:00:00Z"));
    expect(timeOfDay("UTC")).toBe("afternoon");
    vi.setSystemTime(new Date("2026-06-04T20:00:00Z"));
    expect(timeOfDay("UTC")).toBe("evening");
  });

  it("falls back gracefully on an invalid timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T09:00:00Z"));
    expect(["morning", "afternoon", "evening"]).toContain(
      timeOfDay("Not/ARealZone"),
    );
  });
});

describe("daysSince", () => {
  it("returns 0 for nullish or invalid input", () => {
    expect(daysSince(null)).toBe(0);
    expect(daysSince("nope")).toBe(0);
  });

  it("counts whole days since a timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T00:00:00Z"));
    expect(daysSince("2026-06-01T00:00:00Z")).toBe(9);
  });
});
