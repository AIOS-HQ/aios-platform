import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishApprovedJob } from "@/lib/social-publishing/jobs";
import type { ProviderAdapter } from "@/lib/social-publishing/types";

vi.mock("@/lib/harmony/os/events", () => ({
  emitActivity: vi.fn(async () => undefined),
}));

const state = vi.hoisted(() => ({
  beforeClaim: null as null | (() => void),
  job: {
    id: "job-1",
    user_id: "user-1",
    provider: "linkedin",
    content_type: "pdf_carousel",
    title: "Deck",
    caption: "Caption",
    target_identity: "urn:li:organization:123",
    state: "approved",
    media_asset_ids: ["asset-1"],
    idempotency_key: "idem",
    content_hash: "hash",
    approved_content_hash: "hash",
    provider_post_id: null as string | null,
    provider_post_url: null as string | null,
    provider_asset_id: null as string | null,
    attempts: 0,
    last_error: null as string | null,
  },
  media: {
    id: "asset-1",
    user_id: "user-1",
    provider: "linkedin",
    kind: "pdf",
    mime_type: "application/pdf",
    file_name: "deck.pdf",
    byte_size: 100,
    checksum_sha256: "checksum",
    alt_text: null,
    page_count: 6,
    state: "ready",
    provider_asset_id: null,
    storage_path: "public:social-drafts/aios-linkedin-carousel.pdf",
  },
}));

function matches(row: Record<string, unknown>, filters: Array<(row: Record<string, unknown>) => boolean>) {
  return filters.every((filter) => filter(row));
}

class FakeQuery {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private updatePayload: Record<string, unknown> | null = null;
  private wantsSingle = false;
  private wantsSelect = false;

  constructor(private table: "social_publish_jobs" | "social_media_assets") {}

  select() {
    this.wantsSelect = true;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  maybeSingle() {
    this.wantsSingle = true;
    return this.execute();
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private rows(): Record<string, unknown>[] {
    return this.table === "social_publish_jobs" ? [state.job] : [state.media];
  }

  private async execute() {
    if (this.updatePayload && this.table === "social_publish_jobs") {
      if (this.updatePayload.state === "publishing") state.beforeClaim?.();
      const rows = this.rows().filter((row) => matches(row, this.filters));
      for (const row of rows) Object.assign(row, this.updatePayload);
      if (this.wantsSelect || this.wantsSingle) {
        return { data: this.wantsSingle ? rows[0] ?? null : rows, error: null };
      }
      return { data: null, error: null };
    }

    const rows = this.rows().filter((row) => matches(row, this.filters));
    return { data: this.wantsSingle ? rows[0] ?? null : rows, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: "social_publish_jobs" | "social_media_assets") => new FakeQuery(table),
  }),
}));

function resetRows() {
  state.beforeClaim = null;
  Object.assign(state.job, {
    state: "approved",
    provider_post_id: null,
    provider_post_url: null,
    provider_asset_id: null,
    attempts: 0,
    last_error: null,
    approved_content_hash: "hash",
    content_hash: "hash",
  });
}

function adapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    provider: "linkedin",
    capabilities: { textPost: true, documentCarousel: true },
    verifyAccount: vi.fn(async () => ({ ok: true, identity: "urn:li:organization:123", blockers: [] })),
    publish: vi.fn(async () => ({
      providerPostId: "urn:li:share:1",
      providerPostUrl: "https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A1",
      providerAssetId: "urn:li:document:1",
      diagnostics: { document: "urn:li:document:1" },
    })),
    ...overrides,
  };
}

describe("social publishing job persistence", () => {
  beforeEach(() => {
    resetRows();
  });

  it("claims an approved LinkedIn job before publishing and persists provider results", async () => {
    const linkedin = adapter();

    const result = await publishApprovedJob({ userId: "user-1", jobId: "job-1", adapter: linkedin });

    expect(result).toEqual({ ok: true, url: "https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A1" });
    expect(linkedin.publish).toHaveBeenCalledOnce();
    expect(state.job.state).toBe("published");
    expect(state.job.attempts).toBe(1);
    expect(state.job.provider_post_id).toBe("urn:li:share:1");
    expect(state.job.provider_post_url).toBe("https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A1");
  });

  it("does not call LinkedIn when another worker claims the job first", async () => {
    const linkedin = adapter();
    state.beforeClaim = () => {
      state.job.state = "publishing";
    };

    const result = await publishApprovedJob({ userId: "user-1", jobId: "job-1", adapter: linkedin });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("already in progress");
    expect(linkedin.publish).not.toHaveBeenCalled();
    expect(state.job.provider_post_id).toBeNull();
  });

  it("fails closed when the adapter provider does not match the approved LinkedIn job", async () => {
    const wrongAdapter = adapter({
      provider: "x",
      publish: vi.fn(async () => {
        throw new Error("should not publish");
      }),
    });

    const result = await publishApprovedJob({ userId: "user-1", jobId: "job-1", adapter: wrongAdapter });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Provider adapter does not match");
    expect(wrongAdapter.publish).not.toHaveBeenCalled();
    expect(state.job.state).toBe("failed");
  });
});
