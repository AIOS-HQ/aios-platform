import "server-only";
import { RetryableError } from "@/lib/integrations/runtime/retry";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export interface CalendarRequest { method?: "GET" | "POST" | "DELETE"; path: string; body?: unknown; }

export async function calendarFetch<T>(accessToken: string, req: CalendarRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${CALENDAR_API}${req.path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) throw new RetryableError(`Calendar ${method} ${req.path} -> ${res.status}`, "calendar_retryable");
  if (!res.ok) { const d = await res.text().catch(() => ""); throw new Error(`Calendar ${method} ${req.path} -> ${res.status}${d ? `: ${d.slice(0, 200)}` : ""}`); }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
