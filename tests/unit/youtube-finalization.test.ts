import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  request: "9a951b9f-3704-42bc-b0d2-da8340e999c7",
  video: "8bb5cf98-6d2f-49ab-8c21-e6a20466ef23",
  job: "dce10894-5602-4c90-b3a7-900c6fc19af4",
};

const state = vi.hoisted(() => ({
  storageComplete: true,
  assetWrites: 0,
  jobWrites: 0,
  intents: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/social-publishing/adapters/youtube", () => ({
  listYouTubeChannels: async () => [{ id: "UC_founder", title: "Founder Channel", customUrl: null }],
  listYouTubePlaylists: async () => [],
}));

vi.mock("@/lib/social-publishing/storage", () => ({
  readAssetRange: async () => {
    const bytes = new Uint8Array(32);
    bytes.set([0x66, 0x74, 0x79, 0x70], 4);
    return bytes;
  },
}));

class FakeQuery {
  private filters = new Map<string, unknown>();
  private operation: "read" | "upsert" | "update" = "read";
  private payload: unknown;

  constructor(private readonly table: string) {}
  select() { return this; }
  eq(field: string, value: unknown) { this.filters.set(field, value); return this; }
  in() { return this; }
  lt() { return this; }
  limit() { return this; }
  update(payload: unknown) { this.operation = "update"; this.payload = payload; return this; }
  upsert(payload: unknown) {
    this.operation = "upsert";
    this.payload = payload;
    if (this.table === "social_media_assets") state.assetWrites += 1;
    if (this.table === "social_publish_jobs") state.jobWrites += 1;
    return this;
  }
  async maybeSingle() {
    if (this.table !== "social_upload_intents") return { data: null, error: null };
    const data = state.intents.find((intent) =>
      Array.from(this.filters.entries()).every(([field, value]) => intent[field] === value),
    ) ?? null;
    return { data, error: null };
  }
  async single() {
    if (this.table === "social_publish_jobs" && this.operation === "upsert") {
      return { data: { id: ids.job, state: "awaiting_approval" }, error: null };
    }
    return { data: null, error: null };
  }
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    if (this.table === "social_upload_intents" && this.operation === "update") {
      for (const intent of state.intents) {
        if (Array.from(this.filters.entries()).every(([field, value]) => intent[field] === value)) {
          Object.assign(intent, this.payload);
        }
      }
    }
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => new FakeQuery(table),
    storage: {
      from: () => ({
        list: async (_prefix: string, options: { search: string }) => ({
          data: state.storageComplete
            ? [{ name: options.search, metadata: { size: 20 * 1024 * 1024, mimetype: "video/mp4" } }]
            : [],
          error: null,
        }),
      }),
    },
  }),
}));

function videoIntent(companyId = "company-a") {
  return {
    id: ids.video,
    client_request_id: ids.request,
    user_id: "user-a",
    company_id: companyId,
    provider: "youtube",
    kind: "video",
    storage_path: `user-a/${companyId}/social/youtube/${ids.video}/video-launch.mp4`,
    file_name: "launch.mp4",
    declared_mime_type: "video/mp4",
    declared_byte_size: 20 * 1024 * 1024,
    duration_seconds: 180,
    width: 1920,
    height: 1080,
    alt_text: null,
    status: "authorized",
    authorization_expires_at: new Date(Date.now() + 60_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    asset_id: null,
    job_id: null,
  };
}

const draft = {
  clientRequestId: ids.request,
  videoUploadId: ids.video,
  contentType: "youtube_video" as const,
  title: "Launch",
  description: "Founder launch video",
  channelId: "UC_founder",
  visibility: "private" as const,
  tags: ["aios"],
};

describe("YouTube upload finalization", () => {
  beforeEach(() => {
    state.storageComplete = true;
    state.assetWrites = 0;
    state.jobWrites = 0;
    state.intents = [videoIntent()];
  });

  it("verifies storage before creating assets/jobs and remains idempotent on retry", async () => {
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    const first = await finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft });
    const second = await finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft });

    expect(first).toEqual({ jobId: ids.job, state: "awaiting_approval", duplicate: false });
    expect(second).toEqual({ jobId: ids.job, state: "awaiting_approval", duplicate: true });
    expect(state.assetWrites).toBe(1);
    expect(state.jobWrites).toBe(1);
  });

  it("creates no asset or job before storage completion is authoritative", async () => {
    state.storageComplete = false;
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    await expect(finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft }))
      .rejects.toMatchObject({ code: "storage_incomplete" });
    expect(state.assetWrites).toBe(0);
    expect(state.jobWrites).toBe(0);
  });

  it("rejects cross-company finalization", async () => {
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    await expect(finalizeYouTubeDraft({ userId: "user-a", companyId: "company-b", draft }))
      .rejects.toMatchObject({ code: "upload_not_found" });
    expect(state.assetWrites).toBe(0);
    expect(state.jobWrites).toBe(0);
  });
});
