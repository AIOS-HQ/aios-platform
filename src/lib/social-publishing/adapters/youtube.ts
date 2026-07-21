import "server-only";

import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { redactDiagnostics, redactSecret } from "@/lib/integrations/secret-redaction";
import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadAssetBytes, readAssetRange } from "@/lib/social-publishing/storage";
import {
  ExpiredYouTubeUploadSessionError,
  uploadYouTubeResumable,
  type YouTubeUploadResponse,
} from "@/lib/social-publishing/youtube-resumable";
import { updateYouTubeUploadProgress } from "../jobs";
import { validateYouTubeShort } from "../media";
import type {
  ProviderAdapter,
  ProviderPublishResult,
  SocialMediaAsset,
  SocialPublishJob,
  YouTubeVisibility,
} from "../types";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";
export const REQUIRED_YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export interface YouTubeChannel {
  id: string;
  title: string;
  customUrl: string | null;
}

export interface YouTubePlaylist {
  id: string;
  title: string;
  channelId: string | null;
}

type YouTubeVideoResponse = {
  id?: string;
  processingDetails?: { processingStatus?: string };
  status?: { uploadStatus?: string; privacyStatus?: string; publishAt?: string };
};

function requireToken(token: string | null): string {
  if (!token) throw new Error("No valid YouTube access token. Reconnect YouTube with upload permissions.");
  return token;
}

function requireYouTubeJob(job: SocialPublishJob): {
  channelId: string;
  visibility: YouTubeVisibility;
  tags: string[];
} {
  if (job.provider !== "youtube") throw new Error("YouTube adapter received a non-YouTube job.");
  if (job.contentType !== "youtube_video" && job.contentType !== "youtube_short") {
    throw new Error("Unsupported YouTube content type.");
  }
  if (!job.title.trim()) throw new Error("YouTube title is required.");
  if (!job.caption.trim()) throw new Error("YouTube description is required.");
  const channelId = job.youtubeChannelId ?? job.targetIdentity;
  if (!channelId) throw new Error("YouTube channel selection is required before approval.");
  const visibility = job.youtubeVisibility;
  if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public") {
    throw new Error("YouTube visibility must be private, unlisted, or public.");
  }
  if (job.scheduledAt) {
    const scheduled = new Date(job.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) throw new Error("YouTube scheduled publish time is invalid.");
    if (scheduled.getTime() <= Date.now()) throw new Error("YouTube scheduled publish time must be in the future.");
  }
  return { channelId, visibility, tags: job.youtubeTags ?? [] };
}

async function youtubeFetch<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`YouTube request failed (${response.status}): ${redactSecret(text).slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function listYouTubeChannels(userId: string): Promise<YouTubeChannel[]> {
  const token = requireToken(await getValidAccessToken(userId, "youtube", "google"));
  const data = await youtubeFetch<{
    items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }>;
  }>(token, `${YOUTUBE_API}/channels?part=id,snippet&mine=true&maxResults=50`);
  return (data.items ?? [])
    .map((item) => ({
      id: item.id ?? "",
      title: item.snippet?.title ?? item.id ?? "Untitled channel",
      customUrl: item.snippet?.customUrl ?? null,
    }))
    .filter((channel) => Boolean(channel.id));
}

export async function listYouTubePlaylists(userId: string): Promise<YouTubePlaylist[]> {
  const token = requireToken(await getValidAccessToken(userId, "youtube", "google"));
  const data = await youtubeFetch<{
    items?: Array<{ id?: string; snippet?: { title?: string; channelId?: string } }>;
  }>(token, `${YOUTUBE_API}/playlists?part=id,snippet&mine=true&maxResults=50`);
  return (data.items ?? [])
    .map((item) => ({
      id: item.id ?? "",
      title: item.snippet?.title ?? item.id ?? "Untitled playlist",
      channelId: item.snippet?.channelId ?? null,
    }))
    .filter((playlist) => Boolean(playlist.id));
}

type UploadSession = {
  uploadUrl: string;
  acknowledgedOffset: number;
  totalBytes: number | null;
  retryCount: number;
  verifyOffset: boolean;
  completedVideoId: string | null;
};

async function findUploadSession(userId: string, jobId: string): Promise<UploadSession | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("youtube_upload_sessions")
    .select("upload_url_encrypted,acknowledged_offset,total_bytes,retry_count,status,session_expires_at,provider_video_id")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const status = String(row.status ?? "");
  const completedVideoId = row.provider_video_id ? String(row.provider_video_id) : null;
  if (status === "completed" && completedVideoId) {
    return {
      uploadUrl: "",
      acknowledgedOffset: Number(row.acknowledged_offset ?? 0),
      totalBytes: row.total_bytes == null ? null : Number(row.total_bytes),
      retryCount: Number(row.retry_count ?? 0),
      verifyOffset: false,
      completedVideoId,
    };
  }
  if (status !== "uploading") return null;
  const uploadUrl = decryptToken(row.upload_url_encrypted as string | null);
  const expiresAt = row.session_expires_at ? new Date(String(row.session_expires_at)).getTime() : null;
  if (!uploadUrl || (expiresAt != null && expiresAt <= Date.now())) return null;
  return {
    uploadUrl,
    acknowledgedOffset: Number(row.acknowledged_offset ?? 0),
    totalBytes: row.total_bytes == null ? null : Number(row.total_bytes),
    retryCount: Number(row.retry_count ?? 0),
    verifyOffset: true,
    completedVideoId: null,
  };
}

async function persistUploadSession(input: {
  userId: string;
  jobId: string;
  uploadUrl: string;
  totalBytes: number;
  acknowledgedOffset?: number;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  const { error } = await admin.from("youtube_upload_sessions").upsert(
    {
      user_id: input.userId,
      job_id: input.jobId,
      upload_url_encrypted: encryptToken(input.uploadUrl),
      status: "uploading",
      acknowledged_offset: input.acknowledgedOffset ?? 0,
      total_bytes: input.totalBytes,
      retry_count: 0,
      session_expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
      last_error_code: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,job_id" },
  );
  if (error) throw new Error("YouTube upload recovery state could not be saved.");
}

async function updateUploadSessionOffset(input: {
  userId: string;
  jobId: string;
  offset: number;
  retryCount: number;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  const { error } = await admin
    .from("youtube_upload_sessions")
    .update({
      acknowledged_offset: input.offset,
      retry_count: input.retryCount,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("job_id", input.jobId)
    .eq("status", "uploading");
  if (error) throw new Error("YouTube upload offset could not be saved.");
}

async function markUploadSessionExpired(userId: string, jobId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("youtube_upload_sessions")
    .update({
      status: "expired",
      last_error_code: "session_expired",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("job_id", jobId);
}

async function completeUploadSession(userId: string, jobId: string, videoId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("youtube_upload_sessions")
    .update({
      status: "completed",
      provider_video_id: videoId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("job_id", jobId);
}

async function initializeResumableUpload(
  token: string,
  job: SocialPublishJob,
  video: SocialMediaAsset,
  channelId: string,
  visibility: YouTubeVisibility,
): Promise<string> {
  const publishAt = job.scheduledAt ? new Date(job.scheduledAt).toISOString() : undefined;
  const privacyStatus = publishAt ? "private" : visibility;
  const response = await fetch(YOUTUBE_UPLOAD_API + "/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": video.mimeType,
      "X-Upload-Content-Length": String(video.byteSize),
    },
    body: JSON.stringify({
      snippet: {
        title: job.title,
        description: job.caption,
        tags: job.youtubeTags ?? [],
        channelId,
      },
      status: {
        privacyStatus,
        publishAt,
        selfDeclaredMadeForKids: false,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error("YouTube upload initialization failed (" + response.status + "): " + redactSecret(text).slice(0, 500));
  }
  const location = response.headers.get("location");
  if (!location) throw new Error("YouTube upload initialization did not return a resumable upload URL.");
  return location;
}

async function uploadVideoFromStorage(input: {
  token: string;
  userId: string;
  job: SocialPublishJob;
  video: SocialMediaAsset;
  channelId: string;
  visibility: YouTubeVisibility;
}): Promise<YouTubeUploadResponse> {
  let session = await findUploadSession(input.userId, input.job.id);
  if (session?.totalBytes != null && session.totalBytes !== input.video.byteSize) {
    await markUploadSessionExpired(input.userId, input.job.id);
    session = null;
  }
  if (session?.completedVideoId) return { id: session.completedVideoId };
  if (!session) {
    const uploadUrl = await initializeResumableUpload(
      input.token,
      input.job,
      input.video,
      input.channelId,
      input.visibility,
    );
    await persistUploadSession({
      userId: input.userId,
      jobId: input.job.id,
      uploadUrl,
      totalBytes: input.video.byteSize,
    });
    session = {
      uploadUrl,
      acknowledgedOffset: 0,
      totalBytes: input.video.byteSize,
      retryCount: 0,
      verifyOffset: false,
      completedVideoId: null,
    };
  }

  const run = async (active: UploadSession): Promise<YouTubeUploadResponse> =>
    uploadYouTubeResumable({
      uploadUrl: active.uploadUrl,
      accessToken: input.token,
      mimeType: input.video.mimeType,
      totalBytes: input.video.byteSize,
      acknowledgedOffset: active.acknowledgedOffset,
      verifyOffsetBeforeUpload: active.verifyOffset,
      readChunk: (start, endInclusive) => readAssetRange(input.video.storagePath, start, endInclusive),
      onAcknowledgedOffset: async (offset, retryCount) => {
        await updateUploadSessionOffset({
          userId: input.userId,
          jobId: input.job.id,
          offset,
          retryCount,
        });
        await updateYouTubeUploadProgress({
          userId: input.userId,
          jobId: input.job.id,
          state: "uploading",
          progress: 10 + (offset / input.video.byteSize) * 60,
          processingStatus: "uploading",
          diagnostics: { stage: "resumable_upload", acknowledgedBytes: offset, totalBytes: input.video.byteSize },
        });
      },
    });

  try {
    return await run(session);
  } catch (error) {
    if (!(error instanceof ExpiredYouTubeUploadSessionError)) throw error;
    await markUploadSessionExpired(input.userId, input.job.id);
    const uploadUrl = await initializeResumableUpload(
      input.token,
      input.job,
      input.video,
      input.channelId,
      input.visibility,
    );
    await persistUploadSession({
      userId: input.userId,
      jobId: input.job.id,
      uploadUrl,
      totalBytes: input.video.byteSize,
    });
    return run({
      uploadUrl,
      acknowledgedOffset: 0,
      totalBytes: input.video.byteSize,
      retryCount: 0,
      verifyOffset: false,
      completedVideoId: null,
    });
  }
}
async function uploadThumbnail(token: string, videoId: string, thumbnail: SocialMediaAsset): Promise<void> {
  const bytes = await downloadAssetBytes(thumbnail.storagePath);
  await youtubeFetch(token, `${YOUTUBE_UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
    method: "POST",
    headers: {
      "Content-Type": thumbnail.mimeType,
      "Content-Length": String(bytes.byteLength),
    },
    body: Buffer.from(bytes),
  });
}

async function addToPlaylist(token: string, videoId: string, playlistId: string): Promise<void> {
  const existing = await youtubeFetch<{ items?: Array<{ id?: string }> }>(
    token,
    `${YOUTUBE_API}/playlistItems?part=id&playlistId=${encodeURIComponent(playlistId)}&videoId=${encodeURIComponent(videoId)}&maxResults=1`,
  );
  if ((existing.items ?? []).length > 0) return;
  await youtubeFetch(token, `${YOUTUBE_API}/playlistItems?part=snippet`, {
    method: "POST",
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
}

async function pollProcessingStatus(token: string, videoId: string): Promise<string> {
  const data = await youtubeFetch<{ items?: YouTubeVideoResponse[] }>(
    token,
    `${YOUTUBE_API}/videos?part=processingDetails,status&id=${encodeURIComponent(videoId)}`,
  );
  const item = data.items?.[0];
  const processing = item?.processingDetails?.processingStatus ?? item?.status?.uploadStatus ?? "uploaded";
  if (processing === "failed" || processing === "rejected") {
    throw new Error(`YouTube processing failed with status: ${processing}.`);
  }
  return processing;
}

export const youTubePublishingAdapter: ProviderAdapter = {
  provider: "youtube",
  capabilities: {
    channelDiscovery: true,
    channelSwitching: true,
    playlistSelection: true,
    videoUpload: true,
    thumbnailUpload: true,
    metadataEditing: true,
    scheduledPublishing: true,
    shortsPublishing: true,
    processingStatusPolling: true,
  },
  async verifyAccount(userId, expectedIdentity) {
    const health = await getProviderHealth(userId, "youtube");
    if (!health.healthy) return { ok: false, identity: health.identity, blockers: health.blockers };
    const missingScopes = REQUIRED_YOUTUBE_SCOPES.filter((scope) => !health.grantedScopes.includes(scope));
    if (missingScopes.length > 0 && health.grantedScopes.length > 0) {
      return { ok: false, identity: health.identity, blockers: [`Missing YouTube scopes: ${missingScopes.join(", ")}`] };
    }
    const channels = await listYouTubeChannels(userId);
    const match = channels.find((channel) => channel.id === expectedIdentity);
    return {
      ok: Boolean(match),
      identity: match?.title ?? health.identity,
      blockers: match ? [] : ["Connected YouTube account does not expose the approved publishing channel."],
    };
  },
  async publish(userId, job, media): Promise<ProviderPublishResult> {
    const { channelId, visibility } = requireYouTubeJob(job);
    const video = media.find((asset) => asset.kind === "video");
    const thumbnail = media.find((asset) => asset.kind === "thumbnail");
    if (!video) throw new Error("YouTube publishing requires a video asset.");
    if (job.contentType === "youtube_short") validateYouTubeShort(media);

    const token = requireToken(await getValidAccessToken(userId, "youtube", "google"));
    await updateYouTubeUploadProgress({
      userId,
      jobId: job.id,
      state: "uploading",
      progress: 10,
      processingStatus: "uploading",
      diagnostics: { stage: "resumable_upload" },
    });

    const uploaded = await uploadVideoFromStorage({
      token,
      userId,
      job,
      video,
      channelId,
      visibility,
    });
    const videoId = uploaded.id;
    if (!videoId) throw new Error("YouTube upload response did not include a video id.");
    await completeUploadSession(userId, job.id, videoId);
    await updateYouTubeUploadProgress({
      userId,
      jobId: job.id,
      state: "publishing",
      progress: 70,
      processingStatus: "uploaded",
      diagnostics: { stage: "video_uploaded", videoId },
    });

    if (thumbnail) await uploadThumbnail(token, videoId, thumbnail);
    if (job.youtubePlaylistId) await addToPlaylist(token, videoId, job.youtubePlaylistId);
    const processingStatus = await pollProcessingStatus(token, videoId);
    await updateYouTubeUploadProgress({
      userId,
      jobId: job.id,
      state: "publishing",
      progress: 95,
      processingStatus: job.scheduledAt ? "scheduled" : processingStatus === "processed" ? "processed" : "processing",
      diagnostics: { stage: "processing_polled", processingStatus },
    });

    return {
      providerPostId: videoId,
      providerPostUrl: job.contentType === "youtube_short"
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      providerAssetId: videoId,
      diagnostics: redactDiagnostics({
        channelId,
        visibility,
        scheduledAt: job.scheduledAt ?? null,
        playlistId: job.youtubePlaylistId ?? null,
        thumbnailUploaded: Boolean(thumbnail),
        processingStatus,
      }),
    };
  },
};
