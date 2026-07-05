import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/**
 * Minimal Notion API client for capability handlers (mirrors the GitHub
 * reference). 429/5xx → RetryableError; other non-2xx → non-retryable Error.
 * Token supplied by the runtime.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export interface NotionRequest {
  method?: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
}

export async function notionFetch<T>(accessToken: string, req: NotionRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${NOTION_API}${req.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });

  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Notion ${method} ${req.path} -> ${res.status}`, "notion_retryable");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Notion ${method} ${req.path} -> ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}
