export type SocialProvider = "linkedin" | "x";

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

export type SocialContentType = "text" | "image" | "multi_image" | "pdf_carousel";
export type SocialMediaKind = "pdf" | "image";

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
