export const SOCIAL_UPLOAD_BUCKET = "aios-uploads";
export const SOCIAL_UPLOAD_AUTHORIZATION_TTL_MS = 60 * 60 * 1000;
export const SOCIAL_UPLOAD_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
export const SUPABASE_TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const YOUTUBE_VIDEO_MAX_BYTES = 256 * 1024 * 1024 * 1024;
export const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

export const YOUTUBE_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const YOUTUBE_THUMBNAIL_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export type YouTubeUploadKind = "video" | "thumbnail";

export interface YouTubeUploadMetadata {
  clientRequestId: string;
  kind: YouTubeUploadKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
}

export interface YouTubeUploadAuthorization {
  uploadId: string;
  bucket: typeof SOCIAL_UPLOAD_BUCKET;
  path: string;
  expiresAt: string;
  tusEndpoint: string;
}

export interface YouTubeDraftFinalization {
  clientRequestId: string;
  videoUploadId: string;
  thumbnailUploadId?: string | null;
  contentType: "youtube_video" | "youtube_short";
  title: string;
  description: string;
  channelId: string;
  visibility: "private" | "unlisted" | "public";
  tags: string[];
  playlistId?: string | null;
  scheduledAt?: string | null;
}

export interface YouTubeDraftFinalizationResult {
  jobId: string;
  state: "awaiting_approval";
  duplicate: boolean;
}

export type YouTubeUploadErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "invalid_request"
  | "invalid_metadata"
  | "upload_expired"
  | "verification_in_progress"
  | "upload_not_found"
  | "storage_incomplete"
  | "storage_mismatch"
  | "provider_validation"
  | "service_unavailable";

export function uploadIntentAcceptsMutation(intent: {
  status: string;
  authorization_expires_at: string;
  expires_at: string;
}, now = Date.now()): boolean {
  return ["authorized", "uploading"].includes(intent.status)
    && new Date(intent.authorization_expires_at).getTime() > now
    && new Date(intent.expires_at).getTime() > now;
}

export class YouTubeUploadError extends Error {
  constructor(
    public readonly code: YouTubeUploadErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "YouTubeUploadError";
  }
}

export function validateYouTubeUploadMetadata(input: YouTubeUploadMetadata): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return ["Upload metadata is invalid."];
  if (typeof input.clientRequestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.clientRequestId)) {
    errors.push("clientRequestId must be a UUID.");
  }
  if (input.kind !== "video" && input.kind !== "thumbnail") errors.push("Unsupported upload kind.");
  if (typeof input.fileName !== "string" || !input.fileName.trim() || input.fileName.length > 240) errors.push("Filename is invalid.");
  if (typeof input.mimeType !== "string") errors.push("Media type is invalid.");
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) errors.push("File size is invalid.");
  for (const value of [input.durationSeconds, input.width, input.height]) {
    if (value != null && (!Number.isFinite(value) || value <= 0)) errors.push("Media dimensions or duration are invalid.");
  }

  if (input.kind === "video") {
    if (!(YOUTUBE_VIDEO_MIME_TYPES as readonly unknown[]).includes(input.mimeType)) {
      errors.push("YouTube videos must be MP4, MOV, or WEBM.");
    }
    if (input.byteSize > YOUTUBE_VIDEO_MAX_BYTES) errors.push("YouTube video exceeds the 256GB limit.");
  } else {
    if (!(YOUTUBE_THUMBNAIL_MIME_TYPES as readonly unknown[]).includes(input.mimeType)) {
      errors.push("YouTube thumbnails must be JPEG or PNG.");
    }
    if (input.byteSize > YOUTUBE_THUMBNAIL_MAX_BYTES) errors.push("YouTube thumbnail exceeds the 2MB limit.");
  }
  return errors;
}

export function safeUploadFileName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "upload.bin";
}

export function buildYouTubeStoragePath(input: {
  userId: string;
  companyId: string;
  uploadId: string;
  kind: YouTubeUploadKind;
  fileName: string;
}): string {
  return `${input.userId}/${input.companyId}/social/youtube/${input.uploadId}/${input.kind}-${safeUploadFileName(input.fileName)}`;
}

export function assertUploadIntentOwnership(
  intent: { user_id: string; company_id: string; kind: YouTubeUploadKind; storage_path: string },
  expected: { userId: string; companyId: string; expectedKind: YouTubeUploadKind },
): void {
  const expectedPrefix = `${expected.userId}/${expected.companyId}/social/youtube/`;
  if (
    intent.user_id !== expected.userId
    || intent.company_id !== expected.companyId
    || intent.kind !== expected.expectedKind
    || !intent.storage_path.startsWith(expectedPrefix)
  ) {
    throw new YouTubeUploadError("upload_not_found", "The upload does not belong to this account.", 404);
  }
}

export function matchesMediaSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/png") {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "video/webm") return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return bytes.length >= 12
      && bytes[4] === 0x66
      && bytes[5] === 0x74
      && bytes[6] === 0x79
      && bytes[7] === 0x70;
  }
  return false;
}
