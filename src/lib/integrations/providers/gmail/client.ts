import "server-only";
import { RetryableError } from "@/lib/integrations/runtime/retry";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
export interface GmailRequest { method?: "GET" | "POST"; path: string; body?: unknown; }

export async function gmailFetch<T>(accessToken: string, req: GmailRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${GMAIL_API}${req.path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) throw new RetryableError(`Gmail ${method} ${req.path} -> ${res.status}`, "gmail_retryable");
  if (!res.ok) { const d = await res.text().catch(() => ""); throw new Error(`Gmail ${method} ${req.path} -> ${res.status}${d ? `: ${d.slice(0, 200)}` : ""}`); }
  return (await res.json()) as T;
}
