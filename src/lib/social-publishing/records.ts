import type { SocialMediaAsset, SocialPublishJob } from "@/lib/social-publishing/types";

export function socialMediaAssetRow(
  userId: string,
  asset: SocialMediaAsset,
  companyId: string | null = null,
): Record<string, unknown> {
  return {
    id: asset.id,
    user_id: userId,
    company_id: companyId,
    provider: asset.provider,
    kind: asset.kind,
    mime_type: asset.mimeType,
    file_name: asset.fileName,
    storage_path: asset.storagePath ?? null,
    byte_size: asset.byteSize,
    checksum_sha256: asset.checksumSha256,
    page_count: asset.pageCount ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration_seconds: asset.durationSeconds ?? null,
    alt_text: asset.altText ?? null,
    state: asset.state,
  };
}

export function socialPublishJobRow(
  userId: string,
  job: Omit<SocialPublishJob, "id" | "attempts">,
  companyId: string | null = null,
): Record<string, unknown> {
  return {
    user_id: userId,
    company_id: companyId,
    provider: job.provider,
    content_type: job.contentType,
    title: job.title,
    caption: job.caption,
    target_identity: job.targetIdentity,
    youtube_channel_id: job.youtubeChannelId ?? null,
    youtube_channel_title: job.youtubeChannelTitle ?? null,
    youtube_visibility: job.youtubeVisibility ?? null,
    youtube_tags: job.youtubeTags ?? [],
    youtube_playlist_id: job.youtubePlaylistId ?? null,
    youtube_playlist_title: job.youtubePlaylistTitle ?? null,
    scheduled_at: job.scheduledAt ?? null,
    upload_progress: job.uploadProgress ?? null,
    processing_status: job.processingStatus ?? null,
    state: job.state,
    media_asset_ids: job.mediaAssetIds,
    idempotency_key: job.idempotencyKey,
    content_hash: job.contentHash,
  };
}
