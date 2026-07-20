"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { getCompany } from "@/lib/data/os/companies";
import { getEnvelope, upsertEnvelope } from "@/lib/company/envelope/data-access";
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
    const { data: existing } = await supabase
      .from("profiles")
      .select("profile_photo_path")
      .eq("id", user.id)
      .maybeSingle();
    const previousPath = (existing?.profile_photo_path as string | null | undefined) ?? null;
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
    if (previousPath && previousPath !== path && previousPath.startsWith(`${user.id}/profile/`)) {
      await deleteUpload(previousPath);
    }
    revalidatePath("/", "layout");
    revalidatePath("/settings/branding");
  }

  return getDownloadUrl(path, 3600);
}

function validateOwnerBrandPath(
  userId: string,
  path: string | null,
  category: "company-logo" | "company-banner",
): boolean {
  return path === null || path.startsWith(`${userId}/${category}/`);
}

export async function saveCompanyBranding(input: {
  companyId: string;
  logoPath: string | null;
  bannerPath: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (
    !validateOwnerBrandPath(user.id, input.logoPath, "company-logo") ||
    !validateOwnerBrandPath(user.id, input.bannerPath, "company-banner")
  ) {
    return { ok: false, error: "Branding asset path is not allowed." };
  }

  const company = await getCompany(input.companyId);
  if (!company || company.user_id !== user.id) {
    return { ok: false, error: "Company was not found for this account." };
  }

  const envelope = await getEnvelope(company.id);
  const previousLogo = envelope?.brand.logo ?? null;
  const previousBanner = envelope?.brand.banner ?? null;
  const brand = { ...(envelope?.brand ?? {}) };
  if (input.logoPath) brand.logo = input.logoPath;
  else delete brand.logo;
  if (input.bannerPath) brand.banner = input.bannerPath;
  else delete brand.banner;

  const ok = await upsertEnvelope({
    companyId: company.id,
    userId: user.id,
    companyName: envelope?.companyName ?? company.name,
    brand,
  });
  if (!ok) return { ok: false, error: "Could not save company branding." };

  if (previousLogo && previousLogo !== input.logoPath && previousLogo.startsWith(`${user.id}/company-logo/`)) {
    await deleteUpload(previousLogo);
  }
  if (previousBanner && previousBanner !== input.bannerPath && previousBanner.startsWith(`${user.id}/company-banner/`)) {
    await deleteUpload(previousBanner);
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings/branding");
  revalidatePath("/harmony/companies");
  return { ok: true };
}
