"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApprovedLinkedInOrganization } from "@/lib/integrations/linkedin-publisher";
import { getXAccount, xPublishingAdapter } from "./adapters/x";
import { listYouTubeChannels, listYouTubePlaylists, youTubePublishingAdapter } from "./adapters/youtube";
import { linkedInPublishingAdapter } from "./adapters/linkedin";
import { approveSocialPublishJob, contentHash, createIdempotencyKey, publishApprovedJob } from "./jobs";
import { sha256, validateMedia, YOUTUBE_MAX_TAGS } from "./media";
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
    width: asset.width ?? null,
    height: asset.height ?? null,
    duration_seconds: asset.durationSeconds ?? null,
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

function cleanFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload.bin";
}

function parseTags(value: FormDataEntryValue | null): string[] {
  const tags = String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return Array.from(new Set(tags)).slice(0, YOUTUBE_MAX_TAGS);
}

function getRequiredFile(formData: FormData, name: string): File {
  const value = formData.get(name);
  if (!(value instanceof File) || value.size <= 0) throw new Error(`YouTube ${name} file is required.`);
  return value;
}

function getOptionalFile(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  if (!(value instanceof File) || value.size <= 0) return null;
  return value;
}

async function upsertUploadedAsset(input: {
  userId: string;
  file: File;
  kind: "video" | "thumbnail";
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
}): Promise<SocialMediaAsset> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const checksumSha256 = sha256(bytes);
  const existing = await admin
    .from("social_media_assets")
    .select("*")
    .eq("user_id", input.userId)
    .eq("provider", "youtube")
    .eq("checksum_sha256", checksumSha256)
    .maybeSingle();
  if (existing.data) {
    const row = existing.data as Record<string, unknown>;
    return {
      id: String(row.id),
      provider: "youtube",
      kind: row.kind as SocialMediaAsset["kind"],
      mimeType: String(row.mime_type),
      fileName: String(row.file_name),
      byteSize: Number(row.byte_size ?? 0),
      checksumSha256: String(row.checksum_sha256),
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
      altText: (row.alt_text as string | null) ?? null,
      state: row.state as SocialMediaAsset["state"],
      storagePath: (row.storage_path as string | null) ?? null,
    };
  }

  const validation = validateMedia({
    provider: "youtube",
    fileName: input.file.name,
    mimeType: input.file.type,
    byteSize: input.file.size,
    bytes,
    durationSeconds: input.durationSeconds,
    width: input.width,
    height: input.height,
    altText: input.altText,
  });
  if (!validation.ok) throw new Error(validation.blockers.join(" "));

  const id = randomUUID();
  const fileName = cleanFileName(input.file.name);
  const storagePath = `social/youtube/${input.userId}/${checksumSha256}-${fileName}`;
  const { error: uploadError } = await admin.storage
    .from("aios-uploads")
    .upload(storagePath, bytes, { contentType: input.file.type, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const asset: SocialMediaAsset = {
    id,
    provider: "youtube",
    kind: input.kind,
    mimeType: input.file.type,
    fileName,
    byteSize: input.file.size,
    checksumSha256,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds: input.durationSeconds ?? null,
    altText: input.altText ?? null,
    state: "ready",
    storagePath,
  };
  await admin.from("social_media_assets").insert(mediaRow(input.userId, asset));
  return asset;
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

export async function prepareYouTubeDraft(formData: FormData): Promise<void> {
  const user = await requireUser();
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");

  const video = await upsertUploadedAsset({
    userId: user.id,
    file: getRequiredFile(formData, "video"),
    kind: "video",
    durationSeconds: Number(formData.get("duration_seconds") || 0) || null,
    width: Number(formData.get("video_width") || 0) || null,
    height: Number(formData.get("video_height") || 0) || null,
  });
  const thumbnailFile = getOptionalFile(formData, "thumbnail");
  const thumbnail = thumbnailFile
    ? await upsertUploadedAsset({
        userId: user.id,
        file: thumbnailFile,
        kind: "thumbnail",
        altText: String(formData.get("thumbnail_alt") ?? "") || null,
      })
    : null;

  const title = String(formData.get("title") ?? "").trim();
  const caption = String(formData.get("description") ?? "").trim();
  const channelId = String(formData.get("youtube_channel_id") ?? "").trim();
  const visibility = String(formData.get("youtube_visibility") ?? "private");
  const playlistId = String(formData.get("youtube_playlist_id") ?? "").trim() || null;
  const scheduledAtRaw = String(formData.get("scheduled_at") ?? "").trim();
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null;
  const contentType = String(formData.get("content_type") ?? "youtube_video") === "youtube_short"
    ? "youtube_short"
    : "youtube_video";
  const tags = parseTags(formData.get("youtube_tags"));
  if (!title) throw new Error("YouTube title is required.");
  if (!caption) throw new Error("YouTube description is required.");
  if (!channelId) throw new Error("YouTube channel selection is required before approval.");
  if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") {
    throw new Error("YouTube visibility must be private, unlisted, or public.");
  }
  const [channels, playlists] = await Promise.all([
    listYouTubeChannels(user.id),
    listYouTubePlaylists(user.id).catch(() => []),
  ]);
  const selectedChannel = channels.find((channel) => channel.id === channelId);
  if (!selectedChannel) throw new Error("Selected YouTube channel is not available on the connected account.");
  const selectedPlaylist = playlistId ? playlists.find((playlist) => playlist.id === playlistId) : null;
  if (playlistId && !selectedPlaylist) throw new Error("Selected YouTube playlist is not available on the connected account.");

  const media = [video, ...(thumbnail ? [thumbnail] : [])];
  const hash = contentHash({
    provider: "youtube",
    contentType,
    title,
    caption,
    targetIdentity: channelId,
    youtubeChannelId: channelId,
    youtubeVisibility: visibility,
    youtubeTags: tags,
    youtubePlaylistId: playlistId,
    scheduledAt,
    media,
  });
  const job: Omit<SocialPublishJob, "id" | "attempts"> = {
    provider: "youtube",
    contentType,
    title,
    caption,
    targetIdentity: channelId,
    youtubeChannelId: channelId,
    youtubeChannelTitle: selectedChannel.title,
    youtubeVisibility: visibility,
    youtubeTags: tags,
    youtubePlaylistId: playlistId,
    youtubePlaylistTitle: selectedPlaylist?.title ?? null,
    scheduledAt,
    uploadProgress: 0,
    processingStatus: "queued",
    state: "awaiting_approval",
    mediaAssetIds: media.map((asset) => asset.id),
    idempotencyKey: createIdempotencyKey({
      userId: user.id,
      provider: "youtube",
      targetIdentity: channelId,
      contentHash: hash,
    }),
    contentHash: hash,
    approvedContentHash: null,
    providerPostId: null,
    providerPostUrl: null,
    providerAssetId: null,
    lastError: null,
  };
  await admin
    .from("social_publish_jobs")
    .upsert(jobRow(user.id, job), { onConflict: "user_id,provider,idempotency_key" });
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
    adapter: provider === "youtube"
      ? youTubePublishingAdapter
      : provider === "x"
        ? xPublishingAdapter
        : linkedInPublishingAdapter,
  });
  revalidatePath("/harmony/social");
}
