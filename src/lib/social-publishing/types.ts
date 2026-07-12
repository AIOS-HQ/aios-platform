export type SocialProvider = "linkedin" | "x" | "youtube";

export type PublishState =
  | "draft"
  | "preparing_media"
  | "awaiting_approval"
  | "approved"
  | "uploading"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export type MediaState =
  | "draft"
  | "validated"
  | "registered"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export type SocialContentType = "text" | "image" | "multi_image" | "pdf_carousel" | "youtube_video" | "youtube_short";
export type SocialMediaKind = "pdf" | "image" | "video" | "thumbnail";
export type YouTubeVisibility = "private" | "unlisted" | "public";
export type YouTubeProcessingStatus = "queued" | "uploading" | "uploaded" | "processing" | "processed" | "scheduled" | "failed";

export interface SocialMediaAsset {
  id: string;
  provider: SocialProvider;
  kind: SocialMediaKind;
  mimeType: string;
  fileName: string;
  byteSize: number;
  checksumSha256: string;
  altText?: string | null;
  pageCount?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  state: MediaState;
  providerAssetId?: string | null;
  storagePath?: string | null;
}

export interface SocialPublishJob {
  id: string;
  provider: SocialProvider;
  contentType: SocialContentType;
  title: string;
  caption: string;
  targetIdentity: string;
  youtubeChannelId?: string | null;
  youtubeChannelTitle?: string | null;
  youtubeVisibility?: YouTubeVisibility | null;
  youtubeTags?: string[];
  youtubePlaylistId?: string | null;
  youtubePlaylistTitle?: string | null;
  scheduledAt?: string | null;
  uploadProgress?: number | null;
  processingStatus?: YouTubeProcessingStatus | null;
  state: PublishState;
  mediaAssetIds: string[];
  idempotencyKey: string;
  contentHash: string;
  approvedContentHash?: string | null;
  providerPostId?: string | null;
  providerPostUrl?: string | null;
  providerAssetId?: string | null;
  attempts: number;
  lastError?: string | null;
}

export interface ProviderPublishResult {
  providerPostId: string;
  providerPostUrl: string;
  providerAssetId?: string | null;
  diagnostics?: Record<string, unknown>;
}

export interface ProviderAdapter {
  provider: SocialProvider;
  capabilities: Record<string, boolean>;
  verifyAccount(userId: string, expectedIdentity: string): Promise<{ ok: boolean; identity: string | null; blockers: string[] }>;
  publish(userId: string, job: SocialPublishJob, media: SocialMediaAsset[]): Promise<ProviderPublishResult>;
}
