import "server-only";

import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { redactDiagnostics, redactSecret } from "@/lib/integrations/secret-redaction";
import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadAssetBytes } from "@/lib/social-publishing/storage";
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

async function findUploadSession(userId: string, jobId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("youtube_upload_sessions")
    .select("upload_url_encrypted")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();
  const encrypted = (data as { upload_url_encrypted?: string | null } | null)?.upload_url_encrypted ?? null;
  return decryptToken(encrypted);
}

async function persistUploadSession(userId: string, jobId: string, uploadUrl: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.from("youtube_upload_sessions").upsert(
    {
      user_id: userId,
      job_id: jobId,
      upload_url_encrypted: encryptToken(uploadUrl),
      status: "uploading",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,job_id" },
  );
}

async function completeUploadSession(userId: string, jobId: string, videoId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("youtube_upload_sessions")
    .update({ status: "completed", provider_video_id: videoId, updated_at: new Date().toISOString() })
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
  const response = await fetch(`${YOUTUBE_UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
    throw new Error(`YouTube upload initialization failed (${response.status}): ${redactSecret(text).slice(0, 500)}`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error("YouTube upload initialization did not return a resumable upload URL.");
  return location;
}

async function uploadVideoBytes(token: string, uploadUrl: string, video: SocialMediaAsset): Promise<YouTubeVideoResponse> {
  const bytes = await downloadAssetBytes(video.storagePath);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": video.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    },
    body: Buffer.from(bytes),
  });
  const text = await response.text();
  if (response.status === 308) {
    throw new Error("YouTube upload is incomplete and can be retried safely.");
  }
  if (!response.ok) {
    throw new Error(`YouTube video upload failed (${response.status}): ${redactSecret(text).slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as YouTubeVideoResponse;
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

    const sessionUrl = await findUploadSession(userId, job.id)
      ?? await initializeResumableUpload(token, job, video, channelId, visibility);
    await persistUploadSession(userId, job.id, sessionUrl);

    const uploaded = await uploadVideoBytes(token, sessionUrl, video);
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
