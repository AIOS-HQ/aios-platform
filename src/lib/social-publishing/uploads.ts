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

export const STORAGE_DIGEST_CHUNK_BYTES = 8 * 1024 * 1024;

type UploadIntentStatus =
  | "authorized"
  | "uploading"
  | "verifying"
  | "verified"
  | "finalized"
  | "failed"
  | "cancelled"
  | "expired";

export type UploadIntentRow = {
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
  status: UploadIntentStatus;
  authorization_expires_at: string;
  expires_at: string;
  verification_token: string | null;
  verification_started_at: string | null;
  asset_id: string | null;
  job_id: string | null;
};

type StorageMetadata = { size?: number | string; mimetype?: string; contentType?: string };
type StoredObject = { byteSize: number; mimeType: string };

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
    throw new YouTubeUploadError("upload_expired", "This upload is no longer mutable. Start a new upload.", 409);
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
      .in("status", ["authorized", "uploading"])
      .select("*")
      .single();
    if (refreshed.error || !refreshed.data) {
      throw new YouTubeUploadError("service_unavailable", "Upload authorization could not be refreshed.", 503);
    }
    row = refreshed.data as UploadIntentRow;
  }

  return {
    uploadId: row.id,
    bucket: SOCIAL_UPLOAD_BUCKET,
    path: row.storage_path,
    expiresAt: authorizationExpiresAt,
    tusEndpoint: `${env.supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`,
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
  return intent;
}

function validateIntentForDraft(intent: UploadIntentRow, clientRequestId: string): void {
  if (intent.client_request_id !== clientRequestId) {
    throw new YouTubeUploadError("upload_not_found", "The upload does not match this draft.", 404);
  }
  if (["cancelled", "failed", "expired"].includes(intent.status) || new Date(intent.expires_at).getTime() <= Date.now()) {
    throw new YouTubeUploadError("upload_expired", "The upload is no longer available.", 409);
  }
  if (intent.status === "verifying" || intent.status === "verified") {
    throw new YouTubeUploadError("verification_in_progress", "Media verification is already in progress.", 409);
  }
}

async function storedObjectMetadata(intent: UploadIntentRow): Promise<StoredObject> {
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
  return { byteSize, mimeType };
}

export async function sha256AssetRanges(input: {
  byteSize: number;
  readRange: (start: number, endInclusive: number) => Promise<Uint8Array>;
  chunkBytes?: number;
}): Promise<string> {
  const chunkBytes = input.chunkBytes ?? STORAGE_DIGEST_CHUNK_BYTES;
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || !Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new Error("Storage digest bounds are invalid.");
  }
  const digest = createHash("sha256");
  for (let start = 0; start < input.byteSize; start += chunkBytes) {
    const endInclusive = Math.min(start + chunkBytes, input.byteSize) - 1;
    const bytes = await input.readRange(start, endInclusive);
    if (bytes.byteLength !== endInclusive - start + 1) {
      throw new Error("Storage returned an incomplete digest range.");
    }
    digest.update(bytes);
  }
  return digest.digest("hex");
}

async function verifyStoredObject(intent: UploadIntentRow): Promise<StoredObject & { checksumSha256: string }> {
  const before = await storedObjectMetadata(intent);
  const header = await readAssetRange(intent.storage_path, 0, Math.min(31, before.byteSize - 1));
  if (!matchesMediaSignature(before.mimeType, header)) {
    throw new YouTubeUploadError("storage_mismatch", "Stored media contents do not match the declared type.", 409);
  }
  const checksumSha256 = await sha256AssetRanges({
    byteSize: before.byteSize,
    readRange: (start, endInclusive) => readAssetRange(intent.storage_path, start, endInclusive),
  });
  const after = await storedObjectMetadata(intent);
  if (after.byteSize !== before.byteSize || after.mimeType !== before.mimeType) {
    throw new YouTubeUploadError("storage_mismatch", "Stored media changed during verification.", 409);
  }
  return { ...after, checksumSha256 };
}

function assetFromIntent(
  intent: UploadIntentRow,
  stored: StoredObject & { checksumSha256: string },
): SocialMediaAsset {
  return {
    id: intent.id,
    provider: "youtube",
    kind: intent.kind,
    mimeType: stored.mimeType,
    fileName: intent.file_name,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256,
    durationSeconds: intent.duration_seconds == null ? null : Number(intent.duration_seconds),
    width: intent.width,
    height: intent.height,
    altText: intent.alt_text,
    state: "validated",
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
  if (!["private", "unlisted", "public"].includes(input.visibility)) {
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

async function assertVerificationClaim(input: {
  userId: string;
  companyId: string;
  ids: string[];
  verificationToken: string;
}): Promise<void> {
  const admin = requireAdmin();
  const { data, error } = await admin
    .from("social_upload_intents")
    .select("id,status,verification_token")
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .in("id", input.ids);
  const rows = (data ?? []) as Array<{ id: string; status: string; verification_token: string | null }>;
  if (
    error
    || rows.length !== input.ids.length
    || rows.some((row) => row.status !== "verifying" || row.verification_token !== input.verificationToken)
  ) {
    throw new YouTubeUploadError("storage_mismatch", "Upload verification ownership changed unexpectedly.", 409);
  }
}

async function failVerification(input: {
  userId: string;
  companyId: string;
  verificationToken: string;
  errorCode: string;
  jobId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("fail_youtube_upload_verification", {
    p_user_id: input.userId,
    p_company_id: input.companyId,
    p_verification_token: input.verificationToken,
    p_error_code: input.errorCode.slice(0, 80),
    p_job_id: input.jobId ?? null,
  });
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
  const thumbnailIntent = draft.thumbnailUploadId
    ? await loadOwnedIntent({
        userId: input.userId,
        companyId: input.companyId,
        uploadId: draft.thumbnailUploadId,
        expectedKind: "thumbnail",
      })
    : null;

  if (videoIntent.status === "finalized" && videoIntent.job_id) {
    return { jobId: videoIntent.job_id, state: "awaiting_approval", duplicate: true };
  }
  validateIntentForDraft(videoIntent, draft.clientRequestId);
  if (thumbnailIntent) validateIntentForDraft(thumbnailIntent, draft.clientRequestId);

  const [channels, playlists] = await Promise.all([
    listYouTubeChannels(input.userId),
    draft.playlistId ? listYouTubePlaylists(input.userId) : Promise.resolve([]),
  ]);
  const channel = channels.find((candidate) => candidate.id === draft.channelId);
  if (!channel) throw new YouTubeUploadError("provider_validation", "The selected YouTube channel is unavailable.", 409);
  const playlist = draft.playlistId ? playlists.find((candidate) => candidate.id === draft.playlistId) : null;
  if (draft.playlistId && !playlist) {
    throw new YouTubeUploadError("provider_validation", "The selected YouTube playlist is unavailable.", 409);
  }

  const verificationToken = randomUUID();
  const ids = [videoIntent.id, ...(thumbnailIntent ? [thumbnailIntent.id] : [])];
  let claimed = false;
  let stagedJobId: string | null = null;
  try {
    const claim = await admin.rpc("claim_youtube_upload_intents", {
      p_user_id: input.userId,
      p_company_id: input.companyId,
      p_client_request_id: draft.clientRequestId,
      p_video_id: videoIntent.id,
      p_thumbnail_id: thumbnailIntent?.id ?? null,
      p_verification_token: verificationToken,
    });
    if (claim.error || !claim.data || (claim.data as unknown[]).length !== ids.length) {
      const latest = await loadOwnedIntent({
        userId: input.userId,
        companyId: input.companyId,
        uploadId: videoIntent.id,
        expectedKind: "video",
      });
      if (latest.status === "finalized" && latest.job_id) {
        return { jobId: latest.job_id, state: "awaiting_approval", duplicate: true };
      }
      if (latest.status === "verifying" || latest.status === "verified") {
        throw new YouTubeUploadError("verification_in_progress", "Media verification is already in progress.", 409);
      }
      throw new YouTubeUploadError("upload_expired", "The upload could not be claimed for verification.", 409);
    }
    claimed = true;

    const [videoStored, thumbnailStored] = await Promise.all([
      verifyStoredObject(videoIntent),
      thumbnailIntent ? verifyStoredObject(thumbnailIntent) : Promise.resolve(null),
    ]);
    await assertVerificationClaim({
      userId: input.userId,
      companyId: input.companyId,
      ids,
      verificationToken,
    });

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
      state: "preparing_media",
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
    if (assetResult.error) throw new YouTubeUploadError("service_unavailable", "Verified media could not be staged.", 503);

    const existingJob = await admin
      .from("social_publish_jobs")
      .select("id,state,content_hash")
      .eq("user_id", input.userId)
      .eq("provider", "youtube")
      .eq("idempotency_key", job.idempotencyKey)
      .maybeSingle();
    if (existingJob.error) throw new YouTubeUploadError("service_unavailable", "The YouTube draft could not be staged.", 503);
    if (existingJob.data) {
      const existing = existingJob.data as { id: string; state: string; content_hash: string };
      if (existing.content_hash !== hash || existing.state !== "preparing_media") {
        throw new YouTubeUploadError("storage_mismatch", "An incompatible draft already uses this content identity.", 409);
      }
      stagedJobId = existing.id;
    } else {
      const insertedJob = await admin
        .from("social_publish_jobs")
        .insert(socialPublishJobRow(input.userId, job, input.companyId))
        .select("id")
        .single();
      if (insertedJob.error || !insertedJob.data) {
        throw new YouTubeUploadError("service_unavailable", "The YouTube draft could not be staged.", 503);
      }
      stagedJobId = String(insertedJob.data.id);
    }

    const finalized = await admin.rpc("finalize_youtube_upload_draft", {
      p_user_id: input.userId,
      p_company_id: input.companyId,
      p_client_request_id: draft.clientRequestId,
      p_video_id: videoIntent.id,
      p_thumbnail_id: thumbnailIntent?.id ?? null,
      p_verification_token: verificationToken,
      p_job_id: stagedJobId,
    });
    if (finalized.error || !finalized.data) {
      throw new YouTubeUploadError("service_unavailable", "The verified YouTube draft could not be finalized.", 503);
    }
    return { jobId: stagedJobId, state: "awaiting_approval", duplicate: false };
  } catch (error) {
    if (claimed) {
      await failVerification({
        userId: input.userId,
        companyId: input.companyId,
        verificationToken,
        errorCode: error instanceof YouTubeUploadError ? error.code : "verification_failed",
        jobId: stagedJobId,
      });
    }
    if (error instanceof YouTubeUploadError) throw error;
    throw new YouTubeUploadError("service_unavailable", "Media verification failed safely.", 503);
  }
}

export async function cancelYouTubeUpload(input: {
  userId: string;
  companyId: string;
  uploadId: string;
}): Promise<void> {
  const admin = requireAdmin();
  const now = new Date().toISOString();
  const cancelled = await admin
    .from("social_upload_intents")
    .update({ status: "cancelled", authorization_expires_at: now, error_code: "cancelled" })
    .eq("id", input.uploadId)
    .eq("user_id", input.userId)
    .eq("company_id", input.companyId)
    .eq("provider", "youtube")
    .in("status", ["authorized", "uploading"])
    .select("storage_path")
    .maybeSingle();
  if (cancelled.error || !cancelled.data) {
    throw new YouTubeUploadError("invalid_request", "Only an active upload can be cancelled.", 409);
  }
  const storagePath = String((cancelled.data as { storage_path: string }).storage_path);
  await admin.storage.from(SOCIAL_UPLOAD_BUCKET).remove([storagePath]);
}

/** Marks abandoned uploads safely; verifying work is failed after a bounded stale interval. */
export async function markExpiredYouTubeUploadIntents(limit = 100): Promise<number> {
  const admin = requireAdmin();
  const boundedLimit = Math.max(1, Math.min(500, limit));
  const now = new Date().toISOString();
  const staleVerification = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const [expired, stale] = await Promise.all([
    admin
      .from("social_upload_intents")
      .select("id")
      .eq("provider", "youtube")
      .in("status", ["authorized", "uploading"])
      .lt("expires_at", now)
      .limit(boundedLimit),
    admin
      .from("social_upload_intents")
      .select("id")
      .eq("provider", "youtube")
      .in("status", ["verifying", "verified"])
      .lt("verification_started_at", staleVerification)
      .limit(boundedLimit),
  ]);
  const expiredIds = (expired.data ?? []).map((row) => String((row as { id: string }).id));
  const staleIds = (stale.data ?? []).map((row) => String((row as { id: string }).id));
  if (expiredIds.length > 0) {
    await admin
      .from("social_upload_intents")
      .update({ status: "expired", authorization_expires_at: now, error_code: "intent_expired" })
      .in("id", expiredIds)
      .in("status", ["authorized", "uploading"]);
  }
  if (staleIds.length > 0) {
    await admin
      .from("social_upload_intents")
      .update({ status: "failed", authorization_expires_at: now, verification_token: null, error_code: "verification_stale" })
      .in("id", staleIds)
      .in("status", ["verifying", "verified"]);
  }
  return expiredIds.length + staleIds.length;
}
