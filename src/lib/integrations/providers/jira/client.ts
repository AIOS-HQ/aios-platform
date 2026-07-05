import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/**
 * Minimal Jira Cloud REST client (OAuth 3LO via the Atlassian gateway).
 * Calls are scoped to a cloudId (the accessible Jira site). 429/5xx -> RetryableError.
 */
export interface JiraRequest {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
}

export async function jiraFetch<T>(accessToken: string, cloudId: string, req: JiraRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const base = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`;
  const res = await fetch(`${base}${req.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Jira ${method} ${req.path} -> ${res.status}`, "jira_retryable");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Jira ${method} ${req.path} -> ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
