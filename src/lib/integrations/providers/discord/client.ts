import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/** Minimal Discord API client (mirrors the GitHub reference). 429/5xx -> RetryableError. */
const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordRequest {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
}

export async function discordFetch<T>(accessToken: string, req: DiscordRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${DISCORD_API}${req.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Discord ${method} ${req.path} -> ${res.status}`, "discord_retryable");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord ${method} ${req.path} -> ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
