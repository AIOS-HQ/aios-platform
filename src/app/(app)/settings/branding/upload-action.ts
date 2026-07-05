"use server";

import { requireUser } from "@/lib/auth/user";
import { createUploadUrl, getDownloadUrl, type UploadCategory } from "@/lib/uploads/storage";

/**
 * Founder Experience (P6) — upload server actions. Issue an owner-scoped signed
 * upload ticket (the client uploads directly to Storage) and resolve a signed
 * preview URL. Owner-scoped via requireUser + the bucket RLS; no secrets cross
 * the wire beyond the one-time signed token.
 */

export interface UploadTicket {
  path: string;
  token: string;
}

export async function requestUploadTicket(
  category: UploadCategory,
  filename: string,
): Promise<UploadTicket | null> {
  const user = await requireUser();
  const target = await createUploadUrl(user.id, category, filename);
  if (!target) return null;
  return { path: target.path, token: target.token };
}

export async function resolveUploadUrl(path: string): Promise<string | null> {
  await requireUser();
  return getDownloadUrl(path, 3600);
}
