import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/**
 * Minimal Slack Web API client for capability handlers (mirrors the GitHub
 * reference). Maps transport + rate-limit failures onto the runtime's retry
 * taxonomy: HTTP 429/5xx and Slack `ratelimited` → RetryableError; other
 * `ok:false` responses → non-retryable Error. The runtime supplies the token.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackRequest {
  method: string;
  httpMethod?: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}

export async function slackFetch<T>(accessToken: string, req: SlackRequest): Promise<T> {
  const isPost = (req.httpMethod ?? (req.body ? "POST" : "GET")) === "POST";
  const url = new URL(`${SLACK_API}/${req.method}`);
  if (!isPost && req.query) {
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: isPost ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(isPost ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: isPost ? JSON.stringify(req.body ?? {}) : undefined,
  });

  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Slack ${req.method} -> ${res.status}`, "slack_retryable");
  }

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  } & Record<string, unknown>;

  if (!json.ok) {
    if (json.error === "ratelimited") {
      throw new RetryableError(`Slack ${req.method} ratelimited`, "slack_ratelimited");
    }
    throw new Error(`Slack ${req.method}: ${json.error ?? "unknown_error"}`);
  }
  return json as T;
}
