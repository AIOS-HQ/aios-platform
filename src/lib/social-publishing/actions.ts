"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApprovedLinkedInOrganization } from "@/lib/integrations/linkedin-publisher";
import { getXAccount, xPublishingAdapter } from "./adapters/x";
import { linkedInPublishingAdapter } from "./adapters/linkedin";
import { approveSocialPublishJob, publishApprovedJob } from "./jobs";
import {
  LINKEDIN_TEST_MEDIA,
  X_TEST_MEDIA,
  buildLinkedInTestDraft,
  buildXTestDraft,
} from "./test-drafts";
import type { SocialMediaAsset, SocialPublishJob } from "./types";

function mediaRow(userId: string, asset: SocialMediaAsset): Record<string, unknown> {
  return {
    id: asset.id,
    user_id: userId,
    provider: asset.provider,
    kind: asset.kind,
    mime_type: asset.mimeType,
    file_name: asset.fileName,
    storage_path: asset.storagePath ?? null,
    byte_size: asset.byteSize,
    checksum_sha256: asset.checksumSha256,
    page_count: asset.pageCount ?? null,
    alt_text: asset.altText ?? null,
    state: asset.state,
  };
}

function jobRow(userId: string, job: Omit<SocialPublishJob, "id" | "attempts">): Record<string, unknown> {
  return {
    user_id: userId,
    provider: job.provider,
    content_type: job.contentType,
    title: job.title,
    caption: job.caption,
    target_identity: job.targetIdentity,
    state: job.state,
    media_asset_ids: job.mediaAssetIds,
    idempotency_key: job.idempotencyKey,
    content_hash: job.contentHash,
  };
}

async function upsertDraft(userId: string, provider: "linkedin" | "x"): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  if (provider === "linkedin") {
    const org = resolveApprovedLinkedInOrganization();
    if (!org) throw new Error("Configure LINKEDIN_ORGANIZATION_URN or LINKEDIN_ORGANIZATION_ID before creating the LinkedIn draft.");
    await admin.from("social_media_assets").upsert(mediaRow(userId, LINKEDIN_TEST_MEDIA), { onConflict: "id" });
    await admin
      .from("social_publish_jobs")
      .upsert(jobRow(userId, buildLinkedInTestDraft(org.urn)), { onConflict: "user_id,provider,idempotency_key" });
  } else {
    const account = await getXAccount(userId);
    await admin.from("social_media_assets").upsert(X_TEST_MEDIA.map((asset) => mediaRow(userId, asset)), { onConflict: "id" });
    await admin
      .from("social_publish_jobs")
      .upsert(jobRow(userId, buildXTestDraft(account.username)), { onConflict: "user_id,provider,idempotency_key" });
  }
}

export async function prepareLinkedInTestDraft(): Promise<void> {
  const user = await requireUser();
  await upsertDraft(user.id, "linkedin");
  revalidatePath("/harmony/social");
}

export async function prepareXTestDraft(): Promise<void> {
  const user = await requireUser();
  await upsertDraft(user.id, "x");
  revalidatePath("/harmony/social");
}

export async function approveSocialDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("job_id") ?? "");
  if (id) await approveSocialPublishJob(user.id, id);
  revalidatePath("/harmony/social");
}

export async function publishSocialDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("job_id") ?? "");
  const provider = String(formData.get("provider") ?? "");
  if (!id) return;
  await publishApprovedJob({
    userId: user.id,
    jobId: id,
    adapter: provider === "x" ? xPublishingAdapter : linkedInPublishingAdapter,
  });
  revalidatePath("/harmony/social");
}
