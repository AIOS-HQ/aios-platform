import "server-only";

import { createHash } from "node:crypto";
import type { SocialMediaAsset, SocialProvider } from "./types";

const LINKEDIN_PDF_MAX_BYTES = 100 * 1024 * 1024;
const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const X_MAX_IMAGES = 4;

export interface MediaInput {
  provider: SocialProvider;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes?: Uint8Array;
  pageCount?: number | null;
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
}
