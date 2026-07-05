import "server-only";
import { RetryableError } from "@/lib/integrations/runtime/retry";

const HUBSPOT_API = "https://api.hubapi.com";
export interface HubspotRequest { method?: "GET" | "POST" | "DELETE"; path: string; body?: unknown; }

export async function hubspotFetch<T>(accessToken: string, req: HubspotRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${HUBSPOT_API}${req.path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) throw new RetryableError(`HubSpot ${method} ${req.path} -> ${res.status}`, "hubspot_retryable");
  if (!res.ok) { const d = await res.text().catch(() => ""); throw new Error(`HubSpot ${method} ${req.path} -> ${res.status}${d ? `: ${d.slice(0, 200)}` : ""}`); }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
