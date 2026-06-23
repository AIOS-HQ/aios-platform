/** Locale-aware date formatting helpers. */

/** Format an ISO date (date or timestamp) as a short, localized date. */
export function formatDate(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Format an ISO timestamp as a short, localized date + time in UTC.
 * Used for freshness/"as of" indicators that must read as a precise moment
 * (e.g. the Command Center cockpit, which recomputes on every load). UTC is
 * pinned so server-rendered output is deterministic and unambiguous.
 */
export function formatDateTime(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(d);
}

/** Whole days between today and an ISO date (negative = in the past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Time-of-day bucket for greetings, computed in the user's timezone. */
export function timeOfDay(
  timezone = "UTC",
): "morning" | "afternoon" | "evening" {
  let hour = new Date().getHours();
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(new Date());
    const parsed = Number.parseInt(formatted, 10);
    if (!Number.isNaN(parsed)) hour = parsed % 24;
  } catch {
    // invalid timezone — fall back to server hour
  }
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** Whole days since an ISO timestamp. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
