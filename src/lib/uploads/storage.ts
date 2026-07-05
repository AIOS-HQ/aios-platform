import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * AIOS uploads backend (Foundation P6) — owner-scoped object storage on the
 * private `aios-uploads` bucket. Every object lives under `${userId}/...`, which
 * the bucket's RLS enforces, so a founder can only read/write their own assets
 * (profile photo, company logo/banner, chat attachments). Private bucket →
 * access is always via short-lived signed URLs. Additive + inert until a UI
 * calls it.
 */

const BUCKET = "aios-uploads";

export type UploadCategory = "profile" | "company-logo" | "company-banner" | "attachment";

export interface UploadTarget {
  path: string;
  token: string;
  signedUrl: string;
}

function ownerPath(userId: string, category: UploadCategory, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
  return `${userId}/${category}/${Date.now()}-${safe}`;
}

/** One-time signed upload URL under the caller's owner path (RLS-enforced). */
export async function createUploadUrl(
  userId: string,
  category: UploadCategory,
  filename: string,
): Promise<UploadTarget | null> {
  const supabase = await createClient();
  const path = ownerPath(userId, category, filename);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[uploads] createUploadUrl", error?.message);
    return null;
  }
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** Short-lived signed download URL for a private object. */
export async function getDownloadUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) {
    console.error("[uploads] getDownloadUrl", error?.message);
    return null;
  }
  return data.signedUrl;
}

export interface StoredObject {
  name: string;
  path: string;
}

export async function listUploads(userId: string, category?: UploadCategory): Promise<StoredObject[]> {
  const supabase = await createClient();
  const prefix = category ? `${userId}/${category}` : userId;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error || !data) {
    console.error("[uploads] listUploads", error?.message);
    return [];
  }
  return data.map((o) => ({ name: o.name, path: `${prefix}/${o.name}` }));
}

export async function deleteUpload(path: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error("[uploads] deleteUpload", error.message);
    return false;
  }
  return true;
}
