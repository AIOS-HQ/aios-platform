import "server-only";

import { RetryableError } from "@/lib/integrations/runtime/retry";

/** Minimal Google Drive client (mirrors the GitHub reference). 429/5xx -> RetryableError. */
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export interface DriveRequest {
  method?: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
}

export async function driveFetch<T>(accessToken: string, req: DriveRequest): Promise<T> {
  const method = req.method ?? (req.body !== undefined ? "POST" : "GET");
  const res = await fetch(`${DRIVE_API}${req.path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Drive ${method} ${req.path} -> ${res.status}`, "drive_retryable");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive ${method} ${req.path} -> ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Simple media upload (creates a file with the given content). */
export async function driveUploadMedia<T>(accessToken: string, content: string, mimeType: string): Promise<T> {
  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": mimeType },
    body: content,
  });
  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(`Drive upload -> ${res.status}`, "drive_retryable");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive upload -> ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}
