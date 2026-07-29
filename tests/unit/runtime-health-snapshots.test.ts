import { describe, expect, it, vi } from "vitest";
import {
  cacheKeyForScope,
  createRuntimeHealthSnapshotService,
} from "@/lib/runtime/health-snapshots";
import type { ProbeScope, RuntimeProbeSummary } from "@/lib/runtime/probes/types";

const scopeA: ProbeScope = { userId: "u1", companyId: "c1" };
const scopeB: ProbeScope = { userId: "u2", companyId: "c2" };

function makeSummary(scope: ProbeScope, generatedAt: string): RuntimeProbeSummary {
  return {
    status: "healthy",
    generatedAt,
    scope,
    probes: [],
    categories: [],
  };
}

describe("runtime health snapshots", () => {
  it("builds deterministic cache keys", () => {
    expect(cacheKeyForScope({ userId: "u", companyId: null })).toBe("u:none");
    expect(cacheKeyForScope({ userId: "u", companyId: "c" })).toBe("u:c");
  });

  it("creates snapshot on cache miss and reuses on cache hit", async () => {
    const getSummary = vi.fn(async (scope: ProbeScope) => makeSummary(scope, "2026-07-29T00:00:00.000Z"));
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 60_000 });

    const first = await service.getSnapshot(scopeA);
    const second = await service.getSnapshot(scopeA);

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(first.generatedAt).toBe("2026-07-29T00:00:00.000Z");
    expect(second.generatedAt).toBe("2026-07-29T00:00:00.000Z");
  });

  it("expires snapshot by TTL and lazily regenerates", async () => {
    vi.useFakeTimers();
    const getSummary = vi
      .fn()
      .mockResolvedValueOnce(makeSummary(scopeA, "2026-07-29T00:00:00.000Z"))
      .mockResolvedValueOnce(makeSummary(scopeA, "2026-07-29T00:00:10.000Z"));
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 1000 });

    const first = await service.getSnapshot(scopeA);
    vi.advanceTimersByTime(1001);
    const second = await service.getSnapshot(scopeA);

    expect(first.generatedAt).toBe("2026-07-29T00:00:00.000Z");
    expect(second.generatedAt).toBe("2026-07-29T00:00:10.000Z");
    expect(getSummary).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("refresh forces regeneration", async () => {
    const getSummary = vi
      .fn()
      .mockResolvedValueOnce(makeSummary(scopeA, "2026-07-29T00:00:00.000Z"))
      .mockResolvedValueOnce(makeSummary(scopeA, "2026-07-29T00:00:20.000Z"));
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 60_000 });

    await service.getSnapshot(scopeA);
    const refreshed = await service.refreshSnapshot(scopeA);

    expect(refreshed.generatedAt).toBe("2026-07-29T00:00:20.000Z");
    expect(getSummary).toHaveBeenCalledTimes(2);
  });

  it("invalidate removes cached entry", async () => {
    const getSummary = vi.fn(async (scope: ProbeScope) => makeSummary(scope, "2026-07-29T00:00:00.000Z"));
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 60_000 });

    await service.getSnapshot(scopeA);
    expect(service.invalidateSnapshot(scopeA)).toBe(true);
    expect(service.getSnapshotMetadata(scopeA).present).toBe(false);
  });

  it("isolates cache by scope", async () => {
    const getSummary = vi.fn(async (scope: ProbeScope) => makeSummary(scope, scope.userId === "u1" ? "2026-07-29T00:00:00.000Z" : "2026-07-29T00:01:00.000Z"));
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 60_000 });

    const a = await service.getSnapshot(scopeA);
    const b = await service.getSnapshot(scopeB);

    expect(a.scope).toEqual(scopeA);
    expect(b.scope).toEqual(scopeB);
    expect(getSummary).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent reads into one generation", async () => {
    const deferred: { resolve?: (v: RuntimeProbeSummary) => void } = {};
    const getSummary = vi.fn(
      () =>
        new Promise<RuntimeProbeSummary>((resolve) => {
          deferred.resolve = resolve;
        }),
    );
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 60_000 });

    const p1 = service.getSnapshot(scopeA);
    const p2 = service.getSnapshot(scopeA);

    deferred.resolve?.(makeSummary(scopeA, "2026-07-29T00:00:00.000Z"));

    const [s1, s2] = await Promise.all([p1, p2]);
    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(s1.generatedAt).toBe(s2.generatedAt);
  });

  it("exposes metadata freshness", async () => {
    vi.useFakeTimers();
    const getSummary = vi.fn(async (scope: ProbeScope) => makeSummary(scope, "2026-07-29T00:00:00.000Z"));
    const service = createRuntimeHealthSnapshotService({ getSummary } as never, { ttlMs: 1000 });

    await service.getSnapshot(scopeA);
    let meta = service.getSnapshotMetadata(scopeA);
    expect(meta.present).toBe(true);
    expect(meta.stale).toBe(false);

    vi.advanceTimersByTime(1001);
    meta = service.getSnapshotMetadata(scopeA);
    expect(meta.stale).toBe(true);
    expect(meta.present).toBe(false);

    vi.useRealTimers();
  });
});
