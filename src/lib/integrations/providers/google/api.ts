import "server-only";
import { RetryableError } from "@/lib/integrations/runtime/retry";

/**
 * Shared Google API fetch helper for Google-family provider clients (Docs,
 * Sheets, Meet, …). Mirrors the per-provider clients (e.g. gmail/client.ts) but
 * is parameterized by base URL so the Google providers don't each re-implement
 * auth, method inference, retry classification, and error mapping. The runtime
 * supplies a valid access token; 429/5xx become RetryableError so the runtime's
 * retry policy applies; other non-2xx throw a terminal error.
 */

export interface GoogleApiRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
}

export async function googleFetch<T>(baseUrl: string, accessToken: string, req: GoogleApiRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${baseUrl}${req.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Google ${method} ${req.path} -> ${res.status}`, "google_retryable");
  }
  if (!res.ok) {
    const d = await res.text().catch(() => "");
    throw new Error(`Google ${method} ${req.path} -> ${res.status}${d ? `: ${d.slice(0, 200)}` : ""}`);
  }
  // Some Google write endpoints (e.g. batchUpdate, values:update) may return an
  // empty body — guard the JSON parse so success never throws.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Guard: the runtime supplies the token for OAuth connectors; fail loudly if absent. */
export function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Google access token");
  return token;
}
