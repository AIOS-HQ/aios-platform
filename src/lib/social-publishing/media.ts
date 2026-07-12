import "server-only";

import { createHash } from "node:crypto";
import type { SocialMediaAsset, SocialProvider } from "./types";

const LINKEDIN_PDF_MAX_BYTES = 100 * 1024 * 1024;
const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const YOUTUBE_VIDEO_MAX_BYTES = 256 * 1024 * 1024 * 1024;
const YOUTUBE_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const YOUTUBE_SHORT_MAX_SECONDS = 180;
export const X_MAX_IMAGES = 4;
export const YOUTUBE_MAX_TAGS = 30;

export interface MediaInput {
  provider: SocialProvider;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes?: Uint8Array;
  pageCount?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  altText?: string | null;
}

export interface MediaValidationResult {
  ok: boolean;
  checksumSha256: string | null;
  blockers: string[];
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateMedia(input: MediaInput): MediaValidationResult {
  const blockers: string[] = [];
  const checksumSha256 = input.bytes ? sha256(input.bytes) : null;

  if (input.provider === "linkedin") {
    if (input.mimeType !== "application/pdf") blockers.push("LinkedIn document carousel requires a PDF.");
    if (input.byteSize > LINKEDIN_PDF_MAX_BYTES) blockers.push("LinkedIn document exceeds the 100MB limit.");
    if ((input.pageCount ?? 1) > 300) blockers.push("LinkedIn document exceeds the 300-page limit.");
  }

  if (input.provider === "x") {
    if (!["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) {
      blockers.push("X image posts require PNG, JPEG, or WEBP media.");
    }
    if (input.byteSize > X_IMAGE_MAX_BYTES) blockers.push("X image exceeds the 5MB limit.");
  }

  if (input.provider === "youtube") {
    if (input.mimeType.startsWith("video/")) {
      if (!["video/mp4", "video/quicktime", "video/webm"].includes(input.mimeType)) {
        blockers.push("YouTube video uploads require MP4, MOV, or WEBM media.");
      }
      if (input.byteSize > YOUTUBE_VIDEO_MAX_BYTES) blockers.push("YouTube video exceeds the 256GB platform limit.");
    } else if (input.mimeType.startsWith("image/")) {
      if (!["image/jpeg", "image/png"].includes(input.mimeType)) {
        blockers.push("YouTube thumbnails require JPEG or PNG media.");
      }
      if (input.byteSize > YOUTUBE_THUMBNAIL_MAX_BYTES) blockers.push("YouTube thumbnail exceeds the 2MB limit.");
    } else {
      blockers.push("YouTube media must be a supported video or thumbnail image.");
    }
  }

  if (input.byteSize <= 0) blockers.push("Media appears empty or corrupted.");
  return { ok: blockers.length === 0, checksumSha256, blockers };
}

export function assertUniqueMedia(media: SocialMediaAsset[]): void {
  const seen = new Set<string>();
  for (const asset of media) {
    if (seen.has(asset.checksumSha256)) throw new Error("Duplicate media asset detected.");
    seen.add(asset.checksumSha256);
  }
}

export function validateMediaSet(provider: SocialProvider, media: SocialMediaAsset[]): void {
  assertUniqueMedia(media);
  if (provider === "linkedin") {
    if (media.length !== 1 || media[0]?.mimeType !== "application/pdf") {
      throw new Error("LinkedIn carousel requires exactly one PDF asset.");
    }
  }
  if (provider === "x") {
    if (media.length < 1 || media.length > X_MAX_IMAGES) {
      throw new Error(`X multi-image posts require 1-${X_MAX_IMAGES} images.`);
    }
    if (media.some((asset) => !["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType))) {
      throw new Error("X media set contains an unsupported image type.");
    }
  }
  if (provider === "youtube") {
    const videos = media.filter((asset) => asset.kind === "video");
    const thumbnails = media.filter((asset) => asset.kind === "thumbnail");
    if (videos.length !== 1) throw new Error("YouTube publishing requires exactly one video asset.");
    if (thumbnails.length > 1) throw new Error("YouTube publishing supports at most one thumbnail asset.");
    const video = videos[0];
    if (!["video/mp4", "video/quicktime", "video/webm"].includes(video.mimeType)) {
      throw new Error("YouTube video asset must be MP4, MOV, or WEBM.");
    }
    if (video.byteSize > YOUTUBE_VIDEO_MAX_BYTES) throw new Error("YouTube video exceeds the 256GB platform limit.");
    for (const thumbnail of thumbnails) {
      if (!["image/jpeg", "image/png"].includes(thumbnail.mimeType)) {
        throw new Error("YouTube thumbnail asset must be JPEG or PNG.");
      }
      if (thumbnail.byteSize > YOUTUBE_THUMBNAIL_MAX_BYTES) {
        throw new Error("YouTube thumbnail exceeds the 2MB limit.");
      }
    }
  }
}

export function validateYouTubeShort(media: SocialMediaAsset[]): void {
  const video = media.find((asset) => asset.kind === "video");
  if (!video) throw new Error("YouTube Shorts publishing requires a video asset.");
  if (video.durationSeconds != null && video.durationSeconds > YOUTUBE_SHORT_MAX_SECONDS) {
    throw new Error("YouTube Shorts must be 180 seconds or less.");
  }
  if (video.width != null && video.height != null && video.width > video.height) {
    throw new Error("YouTube Shorts should use a vertical or square aspect ratio.");
  }
}
