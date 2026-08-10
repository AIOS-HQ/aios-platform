import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentHash } from "@/lib/social-publishing/jobs";
import { validateMedia, validateMediaSet, validateYouTubeShort } from "@/lib/social-publishing/media";
import type { SocialMediaAsset, SocialPublishJob } from "@/lib/social-publishing/types";

const state = vi.hoisted(() => ({
  accessToken: "youtube-token",
  health: {
    healthy: true,
    identity: "Founder Channel",
    grantedScopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
    blockers: [] as string[],
  },
  sessionUrl: null as string | null,
  sessionStatus: "uploading" as "uploading" | "completed",
  providerVideoId: null as string | null,
  progress: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/social-publishing/storage", () => ({
  downloadAssetBytes: async () => new Uint8Array([1, 2, 3, 4]),
  readAssetRange: async (_path: string, start: number, end: number) =>
    new Uint8Array(end - start + 1).fill((start + 1) % 251),
}));

vi.mock("@/lib/integrations/token-refresh", () => ({
  getValidAccessToken: async () => state.accessToken,
}));

vi.mock("@/lib/integrations/connector-health", () => ({
  getProviderHealth: async () => state.health,
}));

class FakeQuery {
  private tableName: string;
  private payload: Record<string, unknown> | null = null;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.payload = payload;
    if (this.tableName === "social_publish_jobs") state.progress.push(payload);
    if (this.tableName === "youtube_upload_sessions" && typeof payload.provider_video_id === "string") {
      state.sessionStatus = "completed";
      state.providerVideoId = payload.provider_video_id;
    }
    return this;
  }

  upsert(payload: Record<string, unknown>) {
    state.sessionUrl = String(payload.upload_url_encrypted);
    state.sessionStatus = "uploading";
    state.providerVideoId = null;
    return Promise.resolve({ data: null, error: null });
  }

  maybeSingle() {
    if (this.tableName === "youtube_upload_sessions" && (state.sessionUrl || state.providerVideoId)) {
      return Promise.resolve({
        data: {
          upload_url_encrypted: state.sessionUrl,
          acknowledged_offset: 0,
          total_bytes: 4,
          retry_count: 0,
          status: state.sessionStatus,
          provider_video_id: state.providerVideoId,
          session_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.payload, error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tableName: string) => new FakeQuery(tableName),
  }),
}));

function asset(overrides: Partial<SocialMediaAsset> = {}): SocialMediaAsset {
  return {
    id: "video-asset",
    provider: "youtube",
    kind: "video",
    mimeType: "video/mp4",
    fileName: "launch.mp4",
    byteSize: 4,
    checksumSha256: "video-checksum",
    durationSeconds: 60,
    width: 1080,
    height: 1920,
    state: "ready",
    storagePath: "social/youtube/launch.mp4",
    ...overrides,
  };
}

function job(overrides: Partial<SocialPublishJob> = {}): SocialPublishJob {
  return {
    id: "job-1",
    provider: "youtube",
    contentType: "youtube_video",
    title: "Launch update",
    caption: "Production launch update",
    targetIdentity: "UC_founder",
    youtubeChannelId: "UC_founder",
    youtubeChannelTitle: "Founder Channel",
    youtubeVisibility: "unlisted",
    youtubeTags: ["aios", "launch"],
    youtubePlaylistId: "PL_launch",
    youtubePlaylistTitle: "Launches",
    scheduledAt: null,
    uploadProgress: 0,
    processingStatus: "queued",
    state: "approved",
    mediaAssetIds: ["video-asset", "thumb-asset"],
    idempotencyKey: "idem",
    contentHash: "hash",
    approvedContentHash: "hash",
    attempts: 0,
    ...overrides,
  };
}

describe("YouTube publishing media and approval", () => {
  it("validates video, thumbnail, and Shorts constraints", () => {
    expect(validateMedia({ provider: "youtube", fileName: "v.mp4", mimeType: "video/mp4", byteSize: 4 }).ok).toBe(true);
    expect(validateMedia({ provider: "youtube", fileName: "t.jpg", mimeType: "image/jpeg", byteSize: 4 }).ok).toBe(true);
    expect(validateMedia({ provider: "youtube", fileName: "bad.tiff", mimeType: "image/tiff", byteSize: 4 }).ok).toBe(false);
    expect(() => validateMediaSet("youtube", [asset(), asset({ id: "thumb", kind: "thumbnail", mimeType: "image/png", checksumSha256: "thumb" })])).not.toThrow();
    expect(() => validateYouTubeShort([asset({ durationSeconds: 181 })])).toThrow("180 seconds");
    expect(() => validateYouTubeShort([asset({ width: 1920, height: 1080 })])).toThrow("vertical");
  });

  it("hashes every YouTube field that must invalidate Founder approval", () => {
    const base = contentHash({
      provider: "youtube",
      contentType: "youtube_video",
      title: "Launch update",
      caption: "Description",
      targetIdentity: "UC_founder",
      youtubeChannelId: "UC_founder",
      youtubeVisibility: "unlisted",
      youtubeTags: ["aios"],
      youtubePlaylistId: "PL_launch",
      scheduledAt: "2027-01-01T00:00:00.000Z",
      media: [asset(), asset({ id: "thumb", kind: "thumbnail", checksumSha256: "thumb" })],
    });
    const changed = contentHash({
      provider: "youtube",
      contentType: "youtube_video",
      title: "Launch update",
      caption: "Description",
      targetIdentity: "UC_other",
      youtubeChannelId: "UC_other",
      youtubeVisibility: "public",
      youtubeTags: ["aios", "changed"],
      youtubePlaylistId: "PL_other",
      scheduledAt: "2027-01-02T00:00:00.000Z",
      media: [asset({ checksumSha256: "changed-video" }), asset({ id: "thumb", kind: "thumbnail", checksumSha256: "changed-thumb" })],
    });

    expect(base).toHaveLength(64);
    expect(changed).toHaveLength(64);
    expect(changed).not.toBe(base);
  });
});

describe("YouTube publishing adapter", () => {
  beforeEach(() => {
    state.accessToken = "youtube-token";
    state.sessionUrl = null;
    state.sessionStatus = "uploading";
    state.providerVideoId = null;
    state.progress = [];
    state.health = {
      healthy: true,
      identity: "Founder Channel",
      grantedScopes: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ],
      blockers: [],
    };
  });

  it("verifies selected channel ownership", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/channels")) return Response.json({ items: [{ id: "UC_founder", snippet: { title: "Founder Channel" } }] });
      return new Response("{}", { status: 404 });
    }));
    const { youTubePublishingAdapter } = await import("@/lib/social-publishing/adapters/youtube");

    await expect(youTubePublishingAdapter.verifyAccount("user-1", "UC_founder")).resolves.toMatchObject({ ok: true });
    await expect(youTubePublishingAdapter.verifyAccount("user-1", "UC_other")).resolves.toMatchObject({ ok: false });
  });

  it("runs resumable upload, thumbnail, playlist, and processing polling without leaking tokens", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("uploadType=resumable")) {
        return new Response("", { status: 200, headers: { location: "https://upload.youtube.test/session-1" } });
      }
      if (url.includes("upload.youtube.test")) return Response.json({ id: "video-1" });
      if (url.includes("/thumbnails/set")) return Response.json({ items: [] });
      if (url.includes("/playlistItems")) return Response.json({ id: "playlist-item-1" });
      if (url.includes("/videos?")) return Response.json({ items: [{ processingDetails: { processingStatus: "processed" } }] });
      return new Response("{}", { status: 404 });
    }));
    const { youTubePublishingAdapter } = await import("@/lib/social-publishing/adapters/youtube");
    const result = await youTubePublishingAdapter.publish("user-1", job(), [
      asset(),
      asset({ id: "thumb-asset", kind: "thumbnail", mimeType: "image/png", checksumSha256: "thumb" }),
    ]);

    expect(result.providerPostId).toBe("video-1");
    expect(result.providerPostUrl).toBe("https://www.youtube.com/watch?v=video-1");
    expect(calls.some((call) => call.includes("uploadType=resumable"))).toBe(true);
    expect(calls.some((call) => call.includes("/thumbnails/set"))).toBe(true);
    expect(calls.some((call) => call.includes("/playlistItems"))).toBe(true);
    expect(state.progress.some((entry) => entry.processing_status === "uploaded")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("youtube-token");
  });

  it("reuses an existing resumable upload session on retry", async () => {
    state.sessionUrl = "https://upload.youtube.test/recovered-session";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("uploadType=resumable")) throw new Error("should not initialize a new session");
      if (url.includes("recovered-session")) return Response.json({ id: "video-recovered" });
      if (url.includes("/videos?")) return Response.json({ items: [{ processingDetails: { processingStatus: "processed" } }] });
      return Response.json({});
    }));
    const { youTubePublishingAdapter } = await import("@/lib/social-publishing/adapters/youtube");
    const result = await youTubePublishingAdapter.publish("user-1", job({ youtubePlaylistId: null }), [asset()]);

    expect(result.providerPostId).toBe("video-recovered");
    expect(calls.some((call) => call.includes("uploadType=resumable"))).toBe(false);
    expect(calls.some((call) => call.includes("recovered-session"))).toBe(true);
  });

  it("reuses a completed provider video after downstream retry instead of creating a duplicate", async () => {
    state.sessionStatus = "completed";
    state.providerVideoId = "video-already-uploaded";
    state.sessionUrl = "encrypted-session-placeholder";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("uploadType=resumable") || url.includes("upload.youtube.test")) {
        throw new Error("must not create or transfer a second video");
      }
      if (url.includes("/videos?")) return Response.json({ items: [{ processingDetails: { processingStatus: "processed" } }] });
      return Response.json({});
    }));
    const { youTubePublishingAdapter } = await import("@/lib/social-publishing/adapters/youtube");
    const result = await youTubePublishingAdapter.publish("user-1", job({ youtubePlaylistId: null }), [asset()]);

    expect(result.providerPostId).toBe("video-already-uploaded");
    expect(calls.some((call) => call.includes("uploadType=resumable"))).toBe(false);
  });
});
