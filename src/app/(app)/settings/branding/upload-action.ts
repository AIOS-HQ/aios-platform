"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import {
  createUploadUrl,
  deleteUpload,
  getDownloadUrl,
  type UploadCategory,
} from "@/lib/uploads/storage";
import { validateUploadInput } from "@/lib/uploads/validation";

/**
 * Founder Experience (P6) — upload server actions. Issue an owner-scoped signed
 * upload ticket (the client uploads directly to Storage) and resolve a signed
 * preview URL. Owner-scoped via requireUser + the bucket RLS; no secrets cross
 * the wire beyond the one-time signed token.
 */

export interface UploadTicket {
  path: string;
  token: string;
  error?: string;
}

export async function requestUploadTicket(
  category: UploadCategory,
  filename: string,
  mimeType?: string | null,
  byteSize?: number | null,
): Promise<UploadTicket | null> {
  const user = await requireUser();
  const validation = validateUploadInput({ category, filename, mimeType, byteSize });
  if (!validation.ok) return { path: "", token: "", error: validation.message };

  const target = await createUploadUrl(user.id, category, filename, {
    mimeType,
    byteSize,
  });
  if (!target) return null;
  return { path: target.path, token: target.token };
}

export async function resolveUploadUrl(path: string): Promise<string | null> {
  await requireUser();
  return getDownloadUrl(path, 3600);
}

export async function removeProfilePhoto(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("profile_photo_path")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("[branding-upload] removeProfilePhoto read", readError.message);
    return { ok: false, error: "Could not load the current profile photo." };
  }

  const path = profile?.profile_photo_path as string | null | undefined;
  if (path && path.startsWith(`${user.id}/profile/`)) {
    await deleteUpload(path);
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email, profile_photo_path: null },
      { onConflict: "id" },
    );
  if (error) {
    console.error("[branding-upload] removeProfilePhoto", error.message);
    return { ok: false, error: "Could not remove the profile photo." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings/branding");
  return { ok: true };
}

export async function completeUpload(
  category: UploadCategory,
  path: string,
): Promise<string | null> {
  const user = await requireUser();
  if (!path.startsWith(`${user.id}/${category}/`)) return null;

  if (category === "profile") {
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, email: user.email, profile_photo_path: path },
        { onConflict: "id" },
      );
    if (error) {
      console.error("[branding-upload] completeUpload profile", error.message);
      return null;
    }
    revalidatePath("/", "layout");
    revalidatePath("/settings/branding");
  }

  return getDownloadUrl(path, 3600);
}
