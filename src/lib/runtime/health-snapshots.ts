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
  return JSON.stringify([scope.userId, scope.companyId]);
}

export function createRuntimeHealthSnapshotService(
  orchestrator: RuntimeHealthOrchestrator = runtimeHealthOrchestrator,
  options: RuntimeHealthSnapshotOptions = {},
): RuntimeHealthSnapshotService {
  const rawTtlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const ttlMs = Number.isFinite(rawTtlMs) ? Math.max(1, rawTtlMs) : DEFAULT_TTL_MS;
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, PendingEntry>();
  const generations = new Map<string, number>();

  function cloneSnapshot(snapshot: RuntimeHealthSnapshot): RuntimeHealthSnapshot {
    return {
      scope: { ...snapshot.scope },
      generatedAt: snapshot.generatedAt,
      summary: {
        ...snapshot.summary,
        scope: { ...snapshot.summary.scope },
        probes: snapshot.summary.probes.map((p) => ({
          ...p,
          scope: { ...p.scope },
          evidence: p.evidence.map((e) => ({ ...e })),
        })),
        categories: snapshot.summary.categories.map((c) => ({ ...c })),
      },
    };
  }

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

  async function generate(scope: ProbeScope, key: string, generation: number): Promise<RuntimeHealthSnapshot> {
    const summary = await orchestrator.getSummary(scope);
    const generatedAt = summary.generatedAt;
    const snapshot: RuntimeHealthSnapshot = { scope, summary, generatedAt };
    if (generations.get(key) !== generation) {
      return snapshot;
    }
    const frozen = Object.freeze(cloneSnapshot(snapshot));
    cache.set(key, { snapshot: frozen, expiresAtMs: Date.now() + ttlMs });
    return cloneSnapshot(frozen);
  }

  async function getOrGenerate(scope: ProbeScope, forceRefresh = false): Promise<RuntimeHealthSnapshot> {
    const key = cacheKeyForScope(scope);

    if (!forceRefresh) {
      const cached = readValid(key);
      if (cached) return cloneSnapshot(cached);
    }

    const inFlight = pending.get(key);
    if (inFlight) return inFlight.promise;

    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);

    const promise = generate(scope, key, generation)
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
      const key = cacheKeyForScope(scope);
      generations.set(key, (generations.get(key) ?? 0) + 1);
      return cache.delete(key);
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

      const safe: RuntimeHealthSnapshotMetadata = {
        cacheKey: key,
        scope: { ...scope },
        generatedAt: entry.snapshot.generatedAt,
        expiresAt: new Date(entry.expiresAtMs).toISOString(),
        ageMs,
        ttlMs,
        stale,
        present: !stale,
      };
      return safe;
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
