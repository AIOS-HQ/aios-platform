import { runtimeHealthOrchestrator, type RuntimeHealthOrchestrator } from "@/lib/runtime/health-orchestrator";
import type { ProbeScope, RuntimeProbeSummary } from "@/lib/runtime/probes/types";

/**
 * Runtime Health Snapshots & Caching (6C.2 Slice 2).
 *
 * Thin, read-only infrastructure layer over Runtime Health Orchestrator.
 * Caches complete runtime summaries in-memory per authorized scope for a short
 * TTL to speed repeated reads while preserving deterministic runtime behavior.
 */

export interface RuntimeHealthSnapshot {
  scope: ProbeScope;
  summary: RuntimeProbeSummary;
  generatedAt: string;
}

export interface RuntimeHealthSnapshotMetadata {
  cacheKey: string;
  scope: ProbeScope;
  generatedAt: string | null;
  expiresAt: string | null;
  ageMs: number | null;
  ttlMs: number;
  stale: boolean;
  present: boolean;
}

export interface RuntimeHealthSnapshotService {
  getSnapshot(scope: ProbeScope): Promise<RuntimeHealthSnapshot>;
  refreshSnapshot(scope: ProbeScope): Promise<RuntimeHealthSnapshot>;
  invalidateSnapshot(scope: ProbeScope): boolean;
  getSnapshotMetadata(scope: ProbeScope): RuntimeHealthSnapshotMetadata;
}

interface CacheEntry {
  snapshot: RuntimeHealthSnapshot;
  expiresAtMs: number;
}

interface PendingEntry {
  promise: Promise<RuntimeHealthSnapshot>;
}

export interface RuntimeHealthSnapshotOptions {
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 30_000;

export function cacheKeyForScope(scope: ProbeScope): string {
  return `${scope.userId}:${scope.companyId ?? "none"}`;
}

export function createRuntimeHealthSnapshotService(
  orchestrator: RuntimeHealthOrchestrator = runtimeHealthOrchestrator,
  options: RuntimeHealthSnapshotOptions = {},
): RuntimeHealthSnapshotService {
  const ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_TTL_MS);
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, PendingEntry>();

  function readValid(key: string): RuntimeHealthSnapshot | null {
    const now = Date.now();
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= now) {
      cache.delete(key);
      return null;
    }
    return entry.snapshot;
  }

  async function generate(scope: ProbeScope, key: string): Promise<RuntimeHealthSnapshot> {
    const summary = await orchestrator.getSummary(scope);
    const generatedAt = summary.generatedAt;
    const snapshot: RuntimeHealthSnapshot = { scope, summary, generatedAt };
    cache.set(key, { snapshot, expiresAtMs: Date.now() + ttlMs });
    return snapshot;
  }

  async function getOrGenerate(scope: ProbeScope, forceRefresh = false): Promise<RuntimeHealthSnapshot> {
    const key = cacheKeyForScope(scope);

    if (!forceRefresh) {
      const cached = readValid(key);
      if (cached) return cached;
    }

    const inFlight = pending.get(key);
    if (inFlight) return inFlight.promise;

    const promise = generate(scope, key)
      .finally(() => {
        pending.delete(key);
      });

    pending.set(key, { promise });
    return promise;
  }

  return {
    async getSnapshot(scope: ProbeScope): Promise<RuntimeHealthSnapshot> {
      return getOrGenerate(scope, false);
    },

    async refreshSnapshot(scope: ProbeScope): Promise<RuntimeHealthSnapshot> {
      return getOrGenerate(scope, true);
    },

    invalidateSnapshot(scope: ProbeScope): boolean {
      return cache.delete(cacheKeyForScope(scope));
    },

    getSnapshotMetadata(scope: ProbeScope): RuntimeHealthSnapshotMetadata {
      const key = cacheKeyForScope(scope);
      const now = Date.now();
      const entry = cache.get(key);
      if (!entry) {
        return {
          cacheKey: key,
          scope,
          generatedAt: null,
          expiresAt: null,
          ageMs: null,
          ttlMs,
          stale: true,
          present: false,
        };
      }

      const generatedAtMs = Date.parse(entry.snapshot.generatedAt);
      const ageMs = Number.isNaN(generatedAtMs) ? null : Math.max(0, now - generatedAtMs);
      const stale = entry.expiresAtMs <= now;

      if (stale) {
        cache.delete(key);
      }

      return {
        cacheKey: key,
        scope,
        generatedAt: entry.snapshot.generatedAt,
        expiresAt: new Date(entry.expiresAtMs).toISOString(),
        ageMs,
        ttlMs,
        stale,
        present: !stale,
      };
    },
  };
}

const defaultRuntimeHealthSnapshotService = createRuntimeHealthSnapshotService();

export const runtimeHealthSnapshotService: RuntimeHealthSnapshotService = {
  getSnapshot: (scope) => defaultRuntimeHealthSnapshotService.getSnapshot(scope),
  refreshSnapshot: (scope) => defaultRuntimeHealthSnapshotService.refreshSnapshot(scope),
  invalidateSnapshot: (scope) => defaultRuntimeHealthSnapshotService.invalidateSnapshot(scope),
  getSnapshotMetadata: (scope) => defaultRuntimeHealthSnapshotService.getSnapshotMetadata(scope),
};
