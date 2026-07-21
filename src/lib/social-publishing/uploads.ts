import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { listYouTubeChannels, listYouTubePlaylists } from "./adapters/youtube";
import { contentHash, createIdempotencyKey } from "./jobs";
import { validateMediaSet, validateYouTubeShort, YOUTUBE_MAX_TAGS } from "./media";
import { socialMediaAssetRow, socialPublishJobRow } from "./records";
import { readAssetRange } from "./storage";
import type { SocialMediaAsset, SocialPublishJob } from "./types";
import {
  SOCIAL_UPLOAD_BUCKET,
  SOCIAL_UPLOAD_AUTHORIZATION_TTL_MS,
  SOCIAL_UPLOAD_INTENT_TTL_MS,
  YouTubeUploadError,
  assertUploadIntentOwnership,
  buildYouTubeStoragePath,
  matchesMediaSignature,
  safeUploadFileName,
  validateYouTubeUploadMetadata,
  type YouTubeDraftFinalization,
  type YouTubeDraftFinalizationResult,
  type YouTubeUploadAuthorization,
  type YouTubeUploadMetadata,
} from "./upload-contract";

type UploadIntentRow = {
  id: string;
  client_request_id: string;
  user_id: string;
  company_id: string;
  kind: "video" | "thumbnail";
  storage_path: string;
  file_name: string;
  declared_mime_type: string;
  declared_byte_size: number | string;
  duration_seconds: number | string | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  status: string;
  authorization_expires_at: string;
  expires_at: string;
  asset_id: string | null;
  job_id: string | null;
};

type StorageMetadata = { size?: number | string; mimetype?: string; contentType?: string };

function requireAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new YouTubeUploadError("service_unavailable", "Upload storage is unavailable.", 503);
  return admin;
}

function validateOwner(userId: string, companyId: string): void {
  if (!userId || !companyId) throw new YouTubeUploadError("forbidden", "A Founder company is required.", 403);
}

export async function authorizeYouTubeUpload(input: {
  userId: string;
  companyId: string;
  metadata: YouTubeUploadMetadata;
}): Promise<YouTubeUploadAuthorization> {
  validateOwner(input.userId, input.companyId);
  if (!input.metadata || typeof input.metadata !== "object") {
    throw new YouTubeUploadError("invalid_request", "Upload metadata JSON is invalid.");
  }
  const validationErrors = validateYouTubeUploadMetadata(input.metadata);
  if (validationErrors.length > 0) {
    throw new YouTubeUploadError("invalid_metadata", validationErrors.join(" "));
  }
  const admin = requireAdmin();
  const now = Date.now();
  const existing = await admin
    .from("social_upload_intents")
    .select("*")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("client_request_id", input.metadata.clientRequestId)
    .eq("kind", input.metadata.kind)
    .maybeSingle();
  if (existing.error) throw new YouTubeUploadError("service_unavailable", "Upload authorization could not be created.", 503);

  let row = existing.data as UploadIntentRow | null;
  if (row && (new Date(row.expires_at).getTime() <= now || !["authorized", "uploading"].includes(row.status))) {
    throw new YouTubeUploadError("upload_expired", "This upload authorization has expired. Start a new upload.", 409);
  }
  if (row) {
    const metadataMatches = row.file_name === safeUploadFileName(input.metadata.fileName)
      && row.declared_mime_type === input.metadata.mimeType
      && Number(row.declared_byte_size) === input.metadata.byteSize;
    if (!metadataMatches) {
      throw new YouTubeUploadError("invalid_metadata", "This retry does not match the original upload metadata.", 409);
    }
  }
  const authorizationExpiresAt = new Date(now + SOCIAL_UPLOAD_AUTHORIZATION_TTL_MS).toISOString();
  if (!row) {
    const uploadId = randomUUID();
    const expiresAt = new Date(now + SOCIAL_UPLOAD_INTENT_TTL_MS).toISOString();
    const storagePath = buildYouTubeStoragePath({
      userId: input.userId,
      companyId: input.companyId,
      uploadId,
      kind: input.metadata.kind,
      fileName: input.metadata.fileName,
    });
    const inserted = await admin
      .from("social_upload_intents")
      .insert({
        id: uploadId,
        client_request_id: input.metadata.clientRequestId,
        user_id: input.userId,
        company_id: input.companyId,
        provider: "youtube",
        kind: input.metadata.kind,
        storage_path: storagePath,
        file_name: safeUploadFileName(input.metadata.fileName),
        declared_mime_type: input.metadata.mimeType,
        declared_byte_size: input.metadata.byteSize,
        duration_seconds: input.metadata.durationSeconds ?? null,
        width: input.metadata.width ?? null,
        height: input.metadata.height ?? null,
        alt_text: input.metadata.altText?.trim().slice(0, 500) || null,
        authorization_expires_at: authorizationExpiresAt,
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (inserted.error || !inserted.data) {
      throw new YouTubeUploadError("service_unavailable", "Upload authorization could not be created.", 503);
    }
    row = inserted.data as UploadIntentRow;
  } else {
    const refreshed = await admin
      .from("social_upload_intents")
      .update({ authorization_expires_at: authorizationExpiresAt })
      .eq("id", row.id)
      .eq("user_id", input.userId)
      .eq("company_id", input.companyId)
      .select("*")
      .single();
    if (refreshed.error || !refreshed.data) {
      throw new YouTubeUploadError("service_unavailable", "Upload authorization could not be refreshed.", 503);
    }
    row = refreshed.data as UploadIntentRow;
  }

  const signed = await admin.storage.from(SOCIAL_UPLOAD_BUCKET).createSignedUploadUrl(row.storage_path, { upsert: false });
  if (signed.error || !signed.data) {
    throw new YouTubeUploadError("service_unavailable", "Upload storage authorization is unavailable.", 503);
  }
  const supabaseUrl = env.supabaseUrl.replace(/\/$/, "");
  return {
    uploadId: row.id,
    bucket: SOCIAL_UPLOAD_BUCKET,
    path: row.storage_path,
    signedUrl: signed.data.signedUrl,
    signedToken: signed.data.token,
    expiresAt: authorizationExpiresAt,
    tusEndpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
  };
}

async function loadOwnedIntent(input: {
  userId: string;
  companyId: string;
  uploadId: string;
  expectedKind: "video" | "thumbnail";
}): Promise<UploadIntentRow> {
  const admin = requireAdmin();
  const { data, error } = await admin
    .from("social_upload_intents")
    .select("*")
    .eq("id", input.uploadId)
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("provider", "youtube")
    .eq("kind", input.expectedKind)
    .maybeSingle();
  if (error || !data) throw new YouTubeUploadError("upload_not_found", "The upload does not belong to this account.", 404);
  const intent = data as UploadIntentRow;
  assertUploadIntentOwnership(intent, input);
  if (intent.status === "cancelled" || intent.status === "failed" || intent.status === "expired") {
    throw new YouTubeUploadError("upload_expired", "The upload is no longer available.", 409);
  }
  if (new Date(intent.expires_at).getTime() <= Date.now() && intent.status !== "finalized") {
    await admin.from("social_upload_intents").update({ status: "expired" }).eq("id", intent.id);
    throw new YouTubeUploadError("upload_expired", "The upload authorization has expired.", 409);
  }
  return intent;
}

async function verifyStoredObject(intent: UploadIntentRow): Promise<{ byteSize: number; mimeType: string }> {
  const admin = requireAdmin();
  const slash = intent.storage_path.lastIndexOf("/");
  const prefix = intent.storage_path.slice(0, slash);
  const fileName = intent.storage_path.slice(slash + 1);
  const listed = await admin.storage.from(SOCIAL_UPLOAD_BUCKET).list(prefix, { limit: 2, search: fileName });
  if (listed.error) throw new YouTubeUploadError("service_unavailable", "Storage verification is unavailable.", 503);
  const object = listed.data?.find((candidate) => candidate.name === fileName);
  if (!object) throw new YouTubeUploadError("storage_incomplete", "The upload has not completed yet.", 409);
  const metadata = (object.metadata ?? {}) as StorageMetadata;
  const byteSize = Number(metadata.size ?? 0);
  const mimeType = String(metadata.mimetype ?? metadata.contentType ?? "").toLowerCase();
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || !mimeType) {
    throw new YouTubeUploadError("storage_incomplete", "The stored object is not ready for verification.", 409);
  }
  if (byteSize !== Number(intent.declared_byte_size) || mimeType !== intent.declared_mime_type.toLowerCase()) {
    throw new YouTubeUploadError("storage_mismatch", "Stored media does not match the approved upload metadata.", 409);
  }
  const errors = validateYouTubeUploadMetadata({
    clientRequestId: intent.client_request_id,
    kind: intent.kind,
    fileName: intent.file_name,
    mimeType,
    byteSize,
    durationSeconds: intent.duration_seconds == null ? null : Number(intent.duration_seconds),
    width: intent.width,
    height: intent.height,
    altText: intent.alt_text,
  });
  if (errors.length > 0) throw new YouTubeUploadError("storage_mismatch", errors.join(" "), 409);
  const header = await readAssetRange(intent.storage_path, 0, Math.min(31, byteSize - 1));
  if (!matchesMediaSignature(mimeType, header)) {
    throw new YouTubeUploadError("storage_mismatch", "Stored media contents do not match the declared type.", 409);
  }
  return { byteSize, mimeType };
}

function assetFromIntent(intent: UploadIntentRow, stored: { byteSize: number; mimeType: string }): SocialMediaAsset {
  return {
    id: intent.id,
    provider: "youtube",
    kind: intent.kind,
    mimeType: stored.mimeType,
    fileName: intent.file_name,
    byteSize: stored.byteSize,
    checksumSha256: createHash("sha256")
      .update(`verified-storage-object-v1:${intent.storage_path}:${stored.byteSize}:${stored.mimeType}`)
      .digest("hex"),
    durationSeconds: intent.duration_seconds == null ? null : Number(intent.duration_seconds),
    width: intent.width,
    height: intent.height,
    altText: intent.alt_text,
    state: "ready",
    storagePath: intent.storage_path,
  };
}

function normalizedFinalization(input: YouTubeDraftFinalization): YouTubeDraftFinalization {
  if (
    !input
    || typeof input !== "object"
    || typeof input.clientRequestId !== "string"
    || typeof input.videoUploadId !== "string"
    || (input.thumbnailUploadId != null && typeof input.thumbnailUploadId !== "string")
    || typeof input.title !== "string"
    || typeof input.description !== "string"
    || typeof input.channelId !== "string"
    || !Array.isArray(input.tags)
    || input.tags.some((tag) => typeof tag !== "string")
    || (input.contentType !== "youtube_video" && input.contentType !== "youtube_short")
  ) {
    throw new YouTubeUploadError("invalid_request", "YouTube draft metadata JSON is invalid.");
  }
  const title = input.title.trim();
  const description = input.description.trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.clientRequestId) || !uuid.test(input.videoUploadId) || (input.thumbnailUploadId && !uuid.test(input.thumbnailUploadId)) || !title || title.length > 100 || !description || description.length > 5000 || !input.channelId.trim()) {
    throw new YouTubeUploadError("invalid_request", "Required YouTube draft metadata is missing or invalid.");
  }
  if (!['private', 'unlisted', 'public'].includes(input.visibility)) {
    throw new YouTubeUploadError("invalid_request", "YouTube visibility is invalid.");
  }
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) {
    throw new YouTubeUploadError("invalid_request", "Scheduled publish time must be in the future.");
  }
  return {
    ...input,
    title,
    description,
    channelId: input.channelId.trim(),
    playlistId: input.playlistId?.trim() || null,
    scheduledAt: scheduledAt?.toISOString() ?? null,
    tags: Array.from(new Set(input.tags.map((tag) => tag.trim().slice(0, 500)).filter(Boolean))).slice(0, YOUTUBE_MAX_TAGS),
  };
}

export async function finalizeYouTubeDraft(input: {
  userId: string;
  companyId: string;
  draft: YouTubeDraftFinalization;
}): Promise<YouTubeDraftFinalizationResult> {
  validateOwner(input.userId, input.companyId);
  const draft = normalizedFinalization(input.draft);
  const admin = requireAdmin();
  const videoIntent = await loadOwnedIntent({
    userId: input.userId,
    companyId: input.companyId,
    uploadId: draft.videoUploadId,
    expectedKind: "video",
  });
  if (videoIntent.client_request_id !== draft.clientRequestId) {
    throw new YouTubeUploadError("upload_not_found", "The upload does not match this draft.", 404);
  }
  const thumbnailIntent = draft.thumbnailUploadId
    ? await loadOwnedIntent({
        userId: input.userId,
        companyId: input.companyId,
        uploadId: draft.thumbnailUploadId,
        expectedKind: "thumbnail",
      })
    : null;
  if (thumbnailIntent && thumbnailIntent.client_request_id !== draft.clientRequestId) {
    throw new YouTubeUploadError("upload_not_found", "The thumbnail does not match this draft.", 404);
  }
  if (videoIntent.job_id && videoIntent.status === "finalized") {
    return { jobId: videoIntent.job_id, state: "awaiting_approval", duplicate: true };
  }

  const [videoStored, thumbnailStored, channels, playlists] = await Promise.all([
    verifyStoredObject(videoIntent),
    thumbnailIntent ? verifyStoredObject(thumbnailIntent) : Promise.resolve(null),
    listYouTubeChannels(input.userId),
    draft.playlistId ? listYouTubePlaylists(input.userId) : Promise.resolve([]),
  ]);
  const channel = channels.find((candidate) => candidate.id === draft.channelId);
  if (!channel) throw new YouTubeUploadError("provider_validation", "The selected YouTube channel is unavailable.", 409);
  const playlist = draft.playlistId ? playlists.find((candidate) => candidate.id === draft.playlistId) : null;
  if (draft.playlistId && !playlist) {
    throw new YouTubeUploadError("provider_validation", "The selected YouTube playlist is unavailable.", 409);
  }

  const media = [assetFromIntent(videoIntent, videoStored)];
  if (thumbnailIntent && thumbnailStored) media.push(assetFromIntent(thumbnailIntent, thumbnailStored));
  try {
    validateMediaSet("youtube", media);
    if (draft.contentType === "youtube_short") validateYouTubeShort(media);
  } catch (error) {
    throw new YouTubeUploadError("invalid_metadata", error instanceof Error ? error.message : "Media validation failed.");
  }
  const hash = contentHash({
    provider: "youtube",
    contentType: draft.contentType,
    title: draft.title,
    caption: draft.description,
    targetIdentity: draft.channelId,
    youtubeChannelId: draft.channelId,
    youtubeVisibility: draft.visibility,
    youtubeTags: draft.tags,
    youtubePlaylistId: draft.playlistId,
    scheduledAt: draft.scheduledAt,
    media,
  });
  const job: Omit<SocialPublishJob, "id" | "attempts"> = {
    provider: "youtube",
    contentType: draft.contentType,
    title: draft.title,
    caption: draft.description,
    targetIdentity: draft.channelId,
    youtubeChannelId: draft.channelId,
    youtubeChannelTitle: channel.title,
    youtubeVisibility: draft.visibility,
    youtubeTags: draft.tags,
    youtubePlaylistId: draft.playlistId,
    youtubePlaylistTitle: playlist?.title ?? null,
    scheduledAt: draft.scheduledAt,
    uploadProgress: 0,
    processingStatus: "queued",
    state: "awaiting_approval",
    mediaAssetIds: media.map((asset) => asset.id),
    idempotencyKey: createIdempotencyKey({
      userId: input.userId,
      provider: "youtube",
      targetIdentity: draft.channelId,
      contentHash: hash,
    }),
    contentHash: hash,
    approvedContentHash: null,
    providerPostId: null,
    providerPostUrl: null,
    providerAssetId: null,
    lastError: null,
  };

  const assetResult = await admin
    .from("social_media_assets")
    .upsert(media.map((asset) => socialMediaAssetRow(input.userId, asset, input.companyId)), { onConflict: "id" });
  if (assetResult.error) throw new YouTubeUploadError("service_unavailable", "Verified media could not be registered.", 503);
  const insertedJob = await admin
    .from("social_publish_jobs")
    .upsert(socialPublishJobRow(input.userId, job, input.companyId), { onConflict: "user_id,provider,idempotency_key" })
    .select("id,state")
    .single();
  if (insertedJob.error || !insertedJob.data) {
    throw new YouTubeUploadError("service_unavailable", "The YouTube draft could not be created.", 503);
  }
  const jobId = String(insertedJob.data.id);
  const finalized = await Promise.all(media.map((asset) => admin
    .from("social_upload_intents")
    .update({ status: "finalized", job_id: jobId, asset_id: asset.id })
    .eq("id", asset.id)
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("client_request_id", draft.clientRequestId)));
  if (finalized.some((result) => result.error)) {
    throw new YouTubeUploadError("service_unavailable", "Upload finalization could not be recorded.", 503);
  }
  return { jobId, state: "awaiting_approval", duplicate: false };
}

export async function cancelYouTubeUpload(input: {
  userId: string;
  companyId: string;
  uploadId: string;
}): Promise<void> {
  const intent = await loadOwnedIntent({ ...input, expectedKind: "video" }).catch(async (error) => {
    if (!(error instanceof YouTubeUploadError) || error.code !== "upload_not_found") throw error;
    return loadOwnedIntent({ ...input, expectedKind: "thumbnail" });
  });
  if (intent.status === "finalized") throw new YouTubeUploadError("invalid_request", "A finalized upload cannot be cancelled.", 409);
  const admin = requireAdmin();
  await admin.storage.from(SOCIAL_UPLOAD_BUCKET).remove([intent.storage_path]);
  await admin.from("social_upload_intents").update({ status: "cancelled" }).eq("id", intent.id).eq("user_id", input.userId);
}

/** Marks abandoned authorizations without deleting media or touching finalized work. */
export async function markExpiredYouTubeUploadIntents(limit = 100): Promise<number> {
  const admin = requireAdmin();
  const { data } = await admin
    .from("social_upload_intents")
    .select("id")
    .eq("provider", "youtube")
    .in("status", ["authorized", "uploading"])
    .lt("expires_at", new Date().toISOString())
    .limit(Math.max(1, Math.min(500, limit)));
  const ids = (data ?? []).map((row) => String((row as { id: string }).id));
  if (ids.length === 0) return 0;
  await admin.from("social_upload_intents").update({ status: "expired" }).in("id", ids);
  return ids.length;
}
