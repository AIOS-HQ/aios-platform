import "server-only";

import {
  getLinkedInPublisherHealth,
  preflightLinkedInPublisher,
  redactLinkedInDiagnostics,
  resolveApprovedLinkedInOrganization,
} from "@/lib/integrations/linkedin-publisher";
import { downloadAssetBytes } from "@/lib/social-publishing/storage";
import type { ProviderAdapter, ProviderPublishResult, SocialMediaAsset, SocialPublishJob } from "../types";

const API = "https://api.linkedin.com/rest";
const POLL_ATTEMPTS = 12;
const POLL_DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function token(): string {
  const value = process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN;
  if (!value) throw new Error("LINKEDIN_PUBLISHER_ACCESS_TOKEN is required.");
  return value;
}

function headers(contentType?: string): HeadersInit {
  return {
    Authorization: `Bearer ${token()}`,
    Accept: "application/json",
    "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || "202604",
    "X-Restli-Protocol-Version": "2.0.0",
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function linkedinJson<T>(path: string, init: RequestInit): Promise<{ value: T; response: Response }> {
  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LinkedIn ${path} failed (${response.status}): ${redactLinkedInDiagnostics(text).slice(0, 500)}`);
  }
  return { value: (text ? JSON.parse(text) : {}) as T, response };
}

export async function registerLinkedInDocument(owner: string): Promise<{ document: string; uploadUrl: string }> {
  const { value } = await linkedinJson<{ value?: { document?: string; uploadUrl?: string } }>(
    "/documents?action=initializeUpload",
    {
      method: "POST",
      headers: headers("application/json"),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    },
  );
  const document = value.value?.document;
  const uploadUrl = value.value?.uploadUrl;
  if (!document || !uploadUrl) throw new Error("LinkedIn document registration did not return document/uploadUrl.");
  return { document, uploadUrl };
}

export async function uploadLinkedInDocument(uploadUrl: string, bytes: Uint8Array): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token()}` },
    body: Buffer.from(bytes),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`LinkedIn document upload failed (${response.status}): ${redactLinkedInDiagnostics(text).slice(0, 500)}`);
  }
}

export async function waitForLinkedInDocument(document: string): Promise<void> {
  for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
    const { value } = await linkedinJson<{ status?: string }>(`/documents/${encodeURIComponent(document)}`, {
      method: "GET",
      headers: headers(),
    });
    if (value.status === "AVAILABLE") return;
    if (value.status === "PROCESSING_FAILED") throw new Error("LinkedIn document processing failed.");
    await sleep(POLL_DELAY_MS);
  }
  throw new Error("LinkedIn document processing timed out.");
}

export async function createLinkedInDocumentPost(input: {
  author: string;
  caption: string;
  title: string;
  document: string;
}): Promise<{ postId: string; postUrl: string }> {
  const { response } = await linkedinJson<Record<string, unknown>>("/posts", {
    method: "POST",
    headers: headers("application/json"),
    body: JSON.stringify({
      author: input.author,
      commentary: input.caption,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: { media: { title: input.title, id: input.document } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  const postId = response.headers.get("x-restli-id");
  if (!postId) throw new Error("LinkedIn post creation succeeded without an x-restli-id.");
  return {
    postId,
    postUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`,
  };
}

export const linkedInPublishingAdapter: ProviderAdapter = {
  provider: "linkedin",
  capabilities: {
    textPost: true,
    documentCarousel: true,
    imagePost: false,
    videoPost: false,
  },
  async verifyAccount(_userId, expectedIdentity) {
    const preflight = await preflightLinkedInPublisher(expectedIdentity);
    return {
      ok: preflight.ok && preflight.author === expectedIdentity,
      identity: preflight.author,
      blockers: preflight.ok ? [] : preflight.health.issues.map((issue) => issue.message),
    };
  },
  async publish(_userId: string, job: SocialPublishJob, media: SocialMediaAsset[]): Promise<ProviderPublishResult> {
    const org = resolveApprovedLinkedInOrganization();
    if (!org || job.targetIdentity !== org.urn) throw new Error("LinkedIn organization mismatch.");
    if (job.contentType !== "pdf_carousel") throw new Error("LinkedIn adapter only publishes PDF carousel jobs.");
    const asset = media[0];
    if (!asset || asset.mimeType !== "application/pdf") throw new Error("LinkedIn carousel requires one PDF asset.");

    const health = await getLinkedInPublisherHealth();
    if (!health.healthy) throw new Error(health.issues.map((issue) => issue.message).join(" ") || "LinkedIn health failed.");

    const bytes = await downloadAssetBytes(asset.storagePath);
    const registered = await registerLinkedInDocument(org.urn);
    await uploadLinkedInDocument(registered.uploadUrl, bytes);
    await waitForLinkedInDocument(registered.document);
    const post = await createLinkedInDocumentPost({
      author: org.urn,
      caption: job.caption,
      title: asset.fileName,
      document: registered.document,
    });
    return {
      providerPostId: post.postId,
      providerPostUrl: post.postUrl,
      providerAssetId: registered.document,
      diagnostics: { document: registered.document },
    };
  },
};
