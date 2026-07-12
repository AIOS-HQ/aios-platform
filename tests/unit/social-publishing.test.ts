import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertApprovedExactContent, contentHash } from "@/lib/social-publishing/jobs";
import { assertUniqueMedia, validateMedia, validateMediaSet } from "@/lib/social-publishing/media";
import type { SocialMediaAsset, SocialPublishJob } from "@/lib/social-publishing/types";

const env = vi.hoisted(() => ({
  token: "publisher-token",
}));

vi.mock("@/lib/social-publishing/storage", () => ({
  downloadAssetBytes: async () => new Uint8Array([1, 2, 3, 4]),
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidAccessToken: async () => "x-token",
}));

vi.mock("@/lib/integrations/connector-health", () => ({
  getProviderHealth: async () => ({
    healthy: true,
    identity: "aios",
    grantedScopes: ["tweet.write", "users.read", "media.write"],
    blockers: [],
  }),
}));

function media(over: Partial<SocialMediaAsset> = {}): SocialMediaAsset {
  return {
    id: "asset-1",
    provider: "linkedin",
    kind: "pdf",
    mimeType: "application/pdf",
    fileName: "deck.pdf",
    byteSize: 100,
    checksumSha256: "checksum-1",
    state: "ready",
    storagePath: "public:social-drafts/aios-linkedin-carousel.pdf",
    ...over,
  };
}

function job(over: Partial<SocialPublishJob> = {}): SocialPublishJob {
  return {
    id: "job-1",
    provider: "linkedin",
    contentType: "pdf_carousel",
    title: "Deck",
    caption: "Caption",
    targetIdentity: "urn:li:organization:123",
    state: "approved",
    mediaAssetIds: ["asset-1"],
    idempotencyKey: "idem",
    contentHash: "hash",
    approvedContentHash: "hash",
    attempts: 0,
    ...over,
  };
}

describe("social media pipeline", () => {
  it("rejects invalid MIME types and oversized assets", () => {
    expect(validateMedia({ provider: "linkedin", fileName: "x.png", mimeType: "image/png", byteSize: 1 }).ok).toBe(false);
    expect(validateMedia({ provider: "x", fileName: "x.tiff", mimeType: "image/tiff", byteSize: 1 }).ok).toBe(false);
    expect(validateMedia({ provider: "x", fileName: "x.png", mimeType: "image/png", byteSize: 6 * 1024 * 1024 }).ok).toBe(false);
  });

  it("rejects corrupted and duplicate uploads", () => {
    expect(validateMedia({ provider: "x", fileName: "x.png", mimeType: "image/png", byteSize: 0 }).ok).toBe(false);
    expect(() => assertUniqueMedia([media(), media({ id: "asset-2" })])).toThrow("Duplicate");
  });

  it("validates provider-specific media sets", () => {
    expect(() => validateMediaSet("linkedin", [media()])).not.toThrow();
    expect(() => validateMediaSet("x", [media({ provider: "x", kind: "image", mimeType: "image/png" })])).not.toThrow();
  });
});

describe("approval exactness", () => {
  it("blocks duplicate/modified content after approval hash drift", () => {
    expect(() => assertApprovedExactContent(job())).not.toThrow();
    expect(() => assertApprovedExactContent(job({ contentHash: "changed" }))).toThrow("no longer matches");
    expect(contentHash({ provider: "x", contentType: "multi_image", caption: "a", targetIdentity: "aios", media: [] })).toHaveLength(64);
  });
});

describe("LinkedIn PDF carousel adapter", () => {
  beforeEach(() => {
    process.env.LINKEDIN_PUBLISHER_ACCESS_TOKEN = env.token;
    process.env.LINKEDIN_ORGANIZATION_URN = "urn:li:organization:123";
    process.env.LINKEDIN_API_VERSION = "202604";
  });

  it("runs registration, upload, polling, and post creation", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/organizations/123")) return Response.json({ id: "123", localizedName: "AIOS" });
      if (url.includes("initializeUpload")) return Response.json({ value: { document: "urn:li:document:abc", uploadUrl: "https://upload.linkedin.test/doc" } });
      if (url.includes("upload.linkedin.test")) return new Response("", { status: 201 });
      if (url.includes("/documents/")) return Response.json({ status: "AVAILABLE" });
      if (url.endsWith("/posts")) return new Response("{}", { status: 201, headers: { "x-restli-id": "urn:li:share:1" } });
      return new Response("{}", { status: 404 });
    }));

    const { linkedInPublishingAdapter } = await import("@/lib/social-publishing/adapters/linkedin");
    const result = await linkedInPublishingAdapter.publish("user-1", job(), [media()]);
    expect(result.providerPostId).toBe("urn:li:share:1");
    expect(calls.some((call) => call.includes("initializeUpload"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(env.token);
  });

  it("fails closed on organization mismatch", async () => {
    const { linkedInPublishingAdapter } = await import("@/lib/social-publishing/adapters/linkedin");
    await expect(linkedInPublishingAdapter.publish("user-1", job({ targetIdentity: "urn:li:organization:999" }), [media()])).rejects.toThrow("mismatch");
  });
});

describe("X multi-image adapter", () => {
  it("uploads every image and creates one post", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/users/me")) return Response.json({ data: { id: "42", username: "aios" } });
      if (url.includes("/media/upload")) return Response.json({ data: { id: `media-${Math.random()}` } });
      if (url.includes("/2/tweets")) return Response.json({ data: { id: "tweet-1" } });
      return new Response("{}", { status: 404 });
    }));
    const { xPublishingAdapter } = await import("@/lib/social-publishing/adapters/x");
    const assets = [1, 2, 3, 4].map((n) => media({ id: `asset-${n}`, provider: "x", kind: "image", mimeType: "image/png", checksumSha256: `c${n}` }));
    const result = await xPublishingAdapter.publish("user-1", job({ provider: "x", contentType: "multi_image", targetIdentity: "aios" }), assets);
    expect(result.providerPostId).toBe("tweet-1");
    expect(result.providerPostUrl).toContain("tweet-1");
    expect(JSON.stringify(result)).not.toContain("x-token");
  });
});
