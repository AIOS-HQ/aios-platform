import { describe, expect, it, vi } from "vitest";
import {
  createInternalRuntimeHealthApi,
  internalRuntimeHealthApi,
} from "@/lib/runtime/health-api";
import type { ProbeScope } from "@/lib/runtime/probes/types";

const scope: ProbeScope = { userId: "u1", companyId: "c1" };

function snapshotsMock() {
  return {
    getSnapshot: vi.fn(async () => ({
      scope,
      generatedAt: "2026-07-29T00:00:00.000Z",
      summary: {
        status: "healthy",
        generatedAt: "2026-07-29T00:00:00.000Z",
        scope,
        probes: [],
        categories: [],
      },
    })),
    refreshSnapshot: vi.fn(async () => ({
      scope,
      generatedAt: "2026-07-29T00:01:00.000Z",
      summary: {
        status: "degraded",
        generatedAt: "2026-07-29T00:01:00.000Z",
        scope,
        probes: [],
        categories: [],
      },
    })),
    invalidateSnapshot: vi.fn(() => true),
    getSnapshotMetadata: vi.fn(() => ({
      cacheKey: '["u1","c1"]',
      scope,
      generatedAt: "2026-07-29T00:00:00.000Z",
      expiresAt: "2026-07-29T00:00:30.000Z",
      ageMs: 100,
      ttlMs: 30_000,
      stale: false,
      present: true,
    })),
  };
}

describe("internal runtime health api", () => {
  it("delegates runtime health status reads", async () => {
    const snapshots = snapshotsMock();
    const api = createInternalRuntimeHealthApi(snapshots as never);
    await expect(api.getRuntimeHealth(scope)).resolves.toBe("healthy");
    expect(snapshots.getSnapshot).toHaveBeenCalledWith(scope);
  });

  it("delegates runtime health summary reads", async () => {
    const snapshots = snapshotsMock();
    const api = createInternalRuntimeHealthApi(snapshots as never);
    await expect(api.getRuntimeHealthSummary(scope)).resolves.toMatchObject({ status: "healthy", scope });
    expect(snapshots.getSnapshot).toHaveBeenCalledWith(scope);
  });

  it("delegates metadata reads", () => {
    const snapshots = snapshotsMock();
    const api = createInternalRuntimeHealthApi(snapshots as never);
    expect(api.getRuntimeHealthMetadata(scope)).toMatchObject({ cacheKey: '["u1","c1"]', scope });
    expect(snapshots.getSnapshotMetadata).toHaveBeenCalledWith(scope);
  });

  it("delegates refresh reads", async () => {
    const snapshots = snapshotsMock();
    const api = createInternalRuntimeHealthApi(snapshots as never);
    await expect(api.refreshRuntimeHealth(scope)).resolves.toMatchObject({ generatedAt: "2026-07-29T00:01:00.000Z" });
    expect(snapshots.refreshSnapshot).toHaveBeenCalledWith(scope);
  });

  it("propagates scope unchanged", async () => {
    const snapshots = snapshotsMock();
    const api = createInternalRuntimeHealthApi(snapshots as never);
    const alt: ProbeScope = { userId: "u2", companyId: null };
    await api.getRuntimeHealth(alt);
    expect(snapshots.getSnapshot).toHaveBeenCalledWith(alt);
  });

  it("exposes stable read-only api shape", () => {
    expect(Object.keys(internalRuntimeHealthApi).sort()).toEqual([
      "getRuntimeHealth",
      "getRuntimeHealthMetadata",
      "getRuntimeHealthSummary",
      "refreshRuntimeHealth",
    ]);
  });
});
