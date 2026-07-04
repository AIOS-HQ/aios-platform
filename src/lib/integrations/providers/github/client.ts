import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/**
 * Minimal GitHub REST client for capability handlers.
 *
 * Maps transport failures onto the Universal Capability Runtime's retry
 * taxonomy: HTTP 429 + 5xx → RetryableError (the runtime's retry engine backs
 * off and retries); 4xx → a plain, non-retryable Error. The runtime supplies the
 * access token, so this never touches the token layer and never logs tokens.
 */

const GITHUB_API = "https://api.github.com";

export interface GitHubRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
}

export async function githubFetch<T>(accessToken: string, req: GitHubRequest): Promise<T> {
  const method = req.method ?? "GET";
  const res = await fetch(`${GITHUB_API}${req.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });

  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`GitHub ${method} ${req.path} -> ${res.status}`, "github_retryable");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub ${method} ${req.path} -> ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
