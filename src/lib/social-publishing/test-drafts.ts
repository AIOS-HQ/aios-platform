import "server-only";

import { sha256 } from "./media";
import type { SocialMediaAsset, SocialPublishJob } from "./types";

export const LINKEDIN_TEST_CAPTION =
  "AIOS is the operating system for one founder to run an intelligent workforce: Harmony as Chief of Staff, Julius as organizational intelligence, and specialized agents that turn strategy into execution.";

export const X_TEST_CAPTION =
  "Meet AIOS: Harmony, Julius, and the Intelligent Workforce built to help one founder operate an entire company.";

export const LINKEDIN_TEST_MEDIA: SocialMediaAsset = {
  id: "00000000-0000-4000-8000-000000000101",
  provider: "linkedin",
  kind: "pdf",
  mimeType: "application/pdf",
  fileName: "aios-one-founder-intelligent-workforce.pdf",
  byteSize: 4096,
  checksumSha256: sha256("aios-linkedin-carousel-v1"),
  pageCount: 6,
  altText: "Six-page AIOS carousel introducing Harmony, Julius, the AI Workforce, and Founder Beta.",
  state: "ready",
  storagePath: "public:social-drafts/aios-linkedin-carousel.pdf",
};

export const X_TEST_MEDIA: SocialMediaAsset[] = [1, 2, 3, 4].map((n) => ({
  id: `00000000-0000-4000-8000-00000000020${n}`,
  provider: "x",
  kind: "image",
  mimeType: "image/png",
  fileName: `aios-x-draft-${n}.png`,
  byteSize: 2048,
  checksumSha256: sha256(`aios-x-draft-${n}-v1`),
  altText: [
    "AIOS title card for Harmony, Julius, and the Intelligent Workforce.",
    "Harmony as AI Chief of Staff coordinating founder operations.",
    "Julius turning company knowledge into organizational intelligence.",
    "The Intelligent Workforce executing across departments with Founder approval.",
  ][n - 1],
  state: "ready",
  storagePath: `public:social-drafts/aios-x-draft-${n}.png`,
}));

export function buildLinkedInTestDraft(targetIdentity: string): Omit<SocialPublishJob, "id" | "attempts"> {
  return {
    provider: "linkedin",
    contentType: "pdf_carousel",
    title: "AIOS: One Founder. An Intelligent Workforce. One Operating System.",
    caption: LINKEDIN_TEST_CAPTION,
    targetIdentity,
    state: "awaiting_approval",
    mediaAssetIds: [LINKEDIN_TEST_MEDIA.id],
    idempotencyKey: "aios-linkedin-carousel-founder-beta-v1",
    contentHash: sha256(`linkedin:${targetIdentity}:${LINKEDIN_TEST_CAPTION}:${LINKEDIN_TEST_MEDIA.checksumSha256}`),
    approvedContentHash: null,
    providerPostId: null,
    providerPostUrl: null,
    providerAssetId: null,
    lastError: null,
  };
}

export function buildXTestDraft(targetIdentity: string): Omit<SocialPublishJob, "id" | "attempts"> {
  return {
    provider: "x",
    contentType: "multi_image",
    title: "Meet AIOS: Harmony, Julius, and the Intelligent Workforce.",
    caption: X_TEST_CAPTION,
    targetIdentity,
    state: "awaiting_approval",
    mediaAssetIds: X_TEST_MEDIA.map((asset) => asset.id),
    idempotencyKey: "aios-x-multi-image-founder-beta-v1",
    contentHash: sha256(`x:${targetIdentity}:${X_TEST_CAPTION}:${X_TEST_MEDIA.map((m) => m.checksumSha256).join(":")}`),
    approvedContentHash: null,
    providerPostId: null,
    providerPostUrl: null,
    providerAssetId: null,
    lastError: null,
  };
}
