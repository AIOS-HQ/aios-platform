import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactDiagnostics, redactSecret } from "@/lib/integrations/secret-redaction";
import { emitActivity } from "@/lib/harmony/os/events";
import { validateMediaSet } from "./media";
import type { ProviderAdapter, SocialMediaAsset, SocialPublishJob } from "./types";

export function contentHash(input: {
  provider: string;
  contentType: string;
  caption: string;
  targetIdentity: string;
  media: Pick<SocialMediaAsset, "id" | "checksumSha256" | "altText">[];
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createIdempotencyKey(input: {
  userId: string;
  provider: string;
  targetIdentity: string;
  contentHash: string;
}): string {
  return createHash("sha256")
    .update(`${input.userId}:${input.provider}:${input.targetIdentity}:${input.contentHash}`)
    .digest("hex");
}

export function assertApprovedExactContent(job: SocialPublishJob): void {
  if (job.state !== "approved" && job.state !== "failed") {
    throw new Error("Founder approval is required before publishing.");
  }
  if (!job.approvedContentHash || job.approvedContentHash !== job.contentHash) {
    throw new Error("Approved content no longer matches the final caption and media set.");
  }
}

export function mapJob(row: Record<string, unknown>): SocialPublishJob {
  return {
    id: String(row.id),
    provider: row.provider as SocialPublishJob["provider"],
    contentType: row.content_type as SocialPublishJob["contentType"],
    title: String(row.title),
    caption: String(row.caption),
    targetIdentity: String(row.target_identity),
    state: row.state as SocialPublishJob["state"],
    mediaAssetIds: Array.isArray(row.media_asset_ids) ? (row.media_asset_ids as string[]) : [],
    idempotencyKey: String(row.idempotency_key),
    contentHash: String(row.content_hash),
    approvedContentHash: (row.approved_content_hash as string | null) ?? null,
    providerPostId: (row.provider_post_id as string | null) ?? null,
    providerPostUrl: (row.provider_post_url as string | null) ?? null,
    providerAssetId: (row.provider_asset_id as string | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    lastError: (row.last_error as string | null) ?? null,
  };
}

export function mapMedia(row: Record<string, unknown>): SocialMediaAsset {
  return {
    id: String(row.id),
    provider: row.provider as SocialMediaAsset["provider"],
    kind: row.kind as SocialMediaAsset["kind"],
    mimeType: String(row.mime_type),
    fileName: String(row.file_name),
    byteSize: Number(row.byte_size ?? 0),
    checksumSha256: String(row.checksum_sha256),
    altText: (row.alt_text as string | null) ?? null,
    pageCount: (row.page_count as number | null) ?? null,
    state: row.state as SocialMediaAsset["state"],
    providerAssetId: (row.provider_asset_id as string | null) ?? null,
    storagePath: (row.storage_path as string | null) ?? null,
  };
}

export async function approveSocialPublishJob(userId: string, jobId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("social_publish_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return false;
  const job = mapJob(data as Record<string, unknown>);
  if (job.state !== "awaiting_approval" && job.state !== "approved") return false;
  const { error } = await admin
    .from("social_publish_jobs")
    .update({
      state: "approved",
      approved_content_hash: job.contentHash,
      approved_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("user_id", userId)
    .eq("id", jobId);
  return !error;
}

export async function publishApprovedJob(input: {
  userId: string;
  jobId: string;
  adapter: ProviderAdapter;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Admin client unavailable." };

  const { data: jobRow } = await admin
    .from("social_publish_jobs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.jobId)
    .maybeSingle();
  if (!jobRow) return { ok: false, error: "Publishing job not found." };
  const job = mapJob(jobRow as Record<string, unknown>);

  if (job.providerPostId && job.providerPostUrl) return { ok: true, url: job.providerPostUrl };

  try {
    assertApprovedExactContent(job);
    const health = await input.adapter.verifyAccount(input.userId, job.targetIdentity);
    if (!health.ok) throw new Error(health.blockers.join(" ") || "Provider account health check failed.");

    const { data: mediaRows } = await admin
      .from("social_media_assets")
      .select("*")
      .eq("user_id", input.userId)
      .in("id", job.mediaAssetIds);
    const media = ((mediaRows ?? []) as Record<string, unknown>[]).map(mapMedia);
    validateMediaSet(job.provider, media);

    await admin
      .from("social_publish_jobs")
      .update({ state: "publishing", attempts: job.attempts + 1, last_error: null })
      .eq("user_id", input.userId)
      .eq("id", job.id)
      .is("provider_post_id", null);

    const result = await input.adapter.publish(input.userId, job, media);
    await admin
      .from("social_publish_jobs")
      .update({
        state: "published",
        provider_post_id: result.providerPostId,
        provider_post_url: result.providerPostUrl,
        provider_asset_id: result.providerAssetId ?? null,
        published_at: new Date().toISOString(),
        diagnostics: redactDiagnostics(result.diagnostics ?? {}),
      })
      .eq("user_id", input.userId)
      .eq("id", job.id);

    await emitActivity({
      userId: input.userId,
      kind: "agent_action",
      summary: `Published ${job.provider} social post: ${job.title}`,
      refType: "social_publish_job",
      refId: job.id,
    });
    return { ok: true, url: result.providerPostUrl };
  } catch (error) {
    const message = redactSecret(error);
    await admin
      .from("social_publish_jobs")
      .update({ state: "failed", last_error: message, diagnostics: { error: message } })
      .eq("user_id", input.userId)
      .eq("id", job.id);
    return { ok: false, error: message };
  }
}

export function newDraftId(): string {
  return randomUUID();
}
