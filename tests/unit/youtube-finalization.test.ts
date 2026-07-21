import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadIntentAcceptsMutation } from "@/lib/social-publishing/upload-contract";

const ids = {
  request: "9a951b9f-3704-42bc-b0d2-da8340e999c7",
  video: "8bb5cf98-6d2f-49ab-8c21-e6a20466ef23",
  job: "dce10894-5602-4c90-b3a7-900c6fc19af4",
};
const VIDEO_BYTES = 20 * 1024 * 1024;

const state = vi.hoisted(() => ({
  storageComplete: true,
  assetWrites: 0,
  jobWrites: 0,
  rangeReads: [] as Array<[number, number]>,
  holdRange: false,
  rangeStarted: null as null | (() => void),
  releaseRange: null as null | (() => void),
  intents: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
  jobs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/social-publishing/adapters/youtube", () => ({
  listYouTubeChannels: async () => [{ id: "UC_founder", title: "Founder Channel", customUrl: null }],
  listYouTubePlaylists: async () => [],
}));

vi.mock("@/lib/social-publishing/storage", () => ({
  readAssetRange: async (_path: string, start: number, endInclusive: number) => {
    state.rangeReads.push([start, endInclusive]);
    state.rangeStarted?.();
    if (state.holdRange) await new Promise<void>((resolve) => { state.releaseRange = resolve; });
    const bytes = new Uint8Array(endInclusive - start + 1);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (start + index) % 251;
    if (start <= 4 && endInclusive >= 7) bytes.set([0x66, 0x74, 0x79, 0x70], 4 - start);
    return bytes;
  },
}));

function matches(row: Record<string, unknown>, equals: Map<string, unknown>, includes: Map<string, unknown[]>): boolean {
  return Array.from(equals.entries()).every(([field, value]) => row[field] === value)
    && Array.from(includes.entries()).every(([field, values]) => values.includes(row[field]));
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private equals = new Map<string, unknown>();
  private includes = new Map<string, unknown[]>();
  private operation: "read" | "upsert" | "insert" | "update" = "read";
  private payload: unknown;

  constructor(private readonly table: string) {}
  select() { return this; }
  eq(field: string, value: unknown) { this.equals.set(field, value); return this; }
  in(field: string, values: unknown[]) { this.includes.set(field, values); return this; }
  lt() { return this; }
  limit() { return this; }
  update(payload: unknown) { this.operation = "update"; this.payload = payload; return this; }
  upsert(payload: unknown) { this.operation = "upsert"; this.payload = payload; return this; }
  insert(payload: unknown) { this.operation = "insert"; this.payload = payload; return this; }

  private rows(): Array<Record<string, unknown>> {
    const rows = this.table === "social_upload_intents"
      ? state.intents
      : this.table === "social_media_assets"
        ? state.assets
        : state.jobs;
    return rows.filter((row) => matches(row, this.equals, this.includes));
  }

  async maybeSingle() {
    return { data: this.rows()[0] ?? null, error: null };
  }

  async single() {
    if (this.table === "social_publish_jobs" && this.operation === "insert") {
      const job = { ...(this.payload as Record<string, unknown>), id: ids.job };
      state.jobs.push(job);
      state.jobWrites += 1;
      return { data: { id: ids.job }, error: null };
    }
    return { data: this.rows()[0] ?? null, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.table === "social_media_assets" && this.operation === "upsert") {
      const assets = this.payload as Array<Record<string, unknown>>;
      for (const asset of assets) {
        const index = state.assets.findIndex((candidate) => candidate.id === asset.id);
        if (index >= 0) state.assets[index] = asset;
        else state.assets.push(asset);
      }
      state.assetWrites += 1;
    }
    if (this.operation === "update") {
      for (const row of this.rows()) Object.assign(row, this.payload);
    }
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => new FakeQuery(table),
    rpc: async (name: string, input: Record<string, unknown>) => {
      if (name === "claim_youtube_upload_intents") {
        const target = state.intents.filter((intent) =>
          [input.p_video_id, input.p_thumbnail_id].filter(Boolean).includes(intent.id)
          && intent.user_id === input.p_user_id
          && intent.company_id === input.p_company_id
          && intent.client_request_id === input.p_client_request_id
          && ["authorized", "uploading"].includes(String(intent.status)),
        );
        if (target.length !== (input.p_thumbnail_id ? 2 : 1)) return { data: null, error: { code: "P0001" } };
        for (const intent of target) {
          intent.status = "verifying";
          intent.verification_token = input.p_verification_token;
        }
        return { data: target, error: null };
      }
      if (name === "finalize_youtube_upload_draft") {
        const job = state.jobs.find((candidate) => candidate.id === input.p_job_id);
        if (!job) return { data: null, error: { code: "P0001" } };
        job.state = "awaiting_approval";
        for (const asset of state.assets) asset.state = "ready";
        for (const intent of state.intents.filter((candidate) => candidate.verification_token === input.p_verification_token)) {
          intent.status = "finalized";
          intent.job_id = input.p_job_id;
          intent.asset_id = intent.id;
          intent.verification_token = null;
        }
        return { data: job, error: null };
      }
      if (name === "fail_youtube_upload_verification") {
        const failedIds: unknown[] = [];
        for (const intent of state.intents.filter((candidate) => candidate.verification_token === input.p_verification_token)) {
          intent.status = "failed";
          intent.verification_token = null;
          failedIds.push(intent.id);
        }
        state.assets = state.assets.filter((asset) => !failedIds.includes(asset.id));
        state.jobs = state.jobs.filter((job) => job.id !== input.p_job_id);
        return { data: null, error: null };
      }
      return { data: null, error: { code: "unknown_rpc" } };
    },
    storage: {
      from: () => ({
        list: async (_prefix: string, options: { search: string }) => ({
          data: state.storageComplete
            ? [{ name: options.search, metadata: { size: VIDEO_BYTES, mimetype: "video/mp4" } }]
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
    declared_byte_size: VIDEO_BYTES,
    duration_seconds: 180,
    width: 1920,
    height: 1080,
    alt_text: null,
    status: "authorized",
    authorization_expires_at: new Date(Date.now() + 60_000).toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    verification_token: null,
    verification_started_at: null,
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
    state.rangeReads = [];
    state.holdRange = false;
    state.rangeStarted = null;
    state.releaseRange = null;
    state.intents = [videoIntent()];
    state.assets = [];
    state.jobs = [];
  });

  it("freezes storage, hashes the complete bytes, finalizes once, and returns the same job on retry", async () => {
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    const first = await finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft });
    const second = await finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft });

    expect(first).toEqual({ jobId: ids.job, state: "awaiting_approval", duplicate: false });
    expect(second).toEqual({ jobId: ids.job, state: "awaiting_approval", duplicate: true });
    expect(state.intents[0]).toMatchObject({ status: "finalized", job_id: ids.job });
    expect(state.assets[0]).toMatchObject({ state: "ready", checksum_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(state.rangeReads.some(([start, end]) => start === 0 && end - start + 1 === 8 * 1024 * 1024)).toBe(true);
    expect(state.assetWrites).toBe(1);
    expect(state.jobWrites).toBe(1);
  });

  it("rejects a concurrent finalizer while the first owns the immutable verification claim", async () => {
    state.holdRange = true;
    const rangeStarted = new Promise<void>((resolve) => { state.rangeStarted = resolve; });
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    const first = finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft });
    await rangeStarted;

    // Models a TUS PATCH arriving after the database claim. The authoritative
    // storage RLS function applies the same active-state/expiry contract while
    // holding this intent row lock.
    expect(uploadIntentAcceptsMutation(state.intents[0] as {
      status: string;
      authorization_expires_at: string;
      expires_at: string;
    })).toBe(false);

    await expect(finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft }))
      .rejects.toMatchObject({ code: "verification_in_progress" });
    state.holdRange = false;
    state.releaseRange?.();
    await expect(first).resolves.toMatchObject({ jobId: ids.job, duplicate: false });
    expect(state.jobWrites).toBe(1);
  });

  it("creates no publishable asset or job when authoritative storage verification fails", async () => {
    state.storageComplete = false;
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    await expect(finalizeYouTubeDraft({ userId: "user-a", companyId: "company-a", draft }))
      .rejects.toMatchObject({ code: "storage_incomplete" });
    expect(state.intents[0]).toMatchObject({ status: "failed" });
    expect(state.assets).toEqual([]);
    expect(state.jobs).toEqual([]);
  });

  it("rejects cross-company finalization before claiming or reading storage", async () => {
    const { finalizeYouTubeDraft } = await import("@/lib/social-publishing/uploads");
    await expect(finalizeYouTubeDraft({ userId: "user-a", companyId: "company-b", draft }))
      .rejects.toMatchObject({ code: "upload_not_found" });
    expect(state.rangeReads).toEqual([]);
    expect(state.assets).toEqual([]);
    expect(state.jobs).toEqual([]);
  });

  it("produces different real SHA-256 digests when one byte changes", async () => {
    const { sha256AssetRanges } = await import("@/lib/social-publishing/uploads");
    const bytes = new Uint8Array(12 * 1024 * 1024 + 17);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
    const read = (source: Uint8Array) => async (start: number, endInclusive: number) => source.slice(start, endInclusive + 1);
    const first = await sha256AssetRanges({ byteSize: bytes.length, readRange: read(bytes) });
    bytes[bytes.length - 1] ^= 0xff;
    const second = await sha256AssetRanges({ byteSize: bytes.length, readRange: read(bytes) });

    expect(first).toBe(createHash("sha256").update(bytes.slice(0, -1)).update(Uint8Array.of(bytes.at(-1)! ^ 0xff)).digest("hex"));
    expect(second).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(second).not.toBe(first);
  });
});
