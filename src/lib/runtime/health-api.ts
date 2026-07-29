import {
  runtimeHealthSnapshotService,
  type RuntimeHealthSnapshot,
  type RuntimeHealthSnapshotMetadata,
  type RuntimeHealthSnapshotService,
} from "@/lib/runtime/health-snapshots";
import type { ProbeScope, RuntimeProbeSummary } from "@/lib/runtime/probes/types";

/**
 * Internal Runtime Health API (6C.2 Slice 3).
 *
 * Thin internal delegation layer over Runtime Health Snapshot Service.
 * Read-only contract only; no adapter/aggregation/orchestration/cache logic.
 */

export interface InternalRuntimeHealthApi {
  getRuntimeHealth(scope: ProbeScope): Promise<RuntimeProbeSummary["status"]>;
  getRuntimeHealthSummary(scope: ProbeScope): Promise<RuntimeProbeSummary>;
  getRuntimeHealthMetadata(scope: ProbeScope): RuntimeHealthSnapshotMetadata;
  refreshRuntimeHealth(scope: ProbeScope): Promise<RuntimeHealthSnapshot>;
}

export function createInternalRuntimeHealthApi(
  snapshots: RuntimeHealthSnapshotService = runtimeHealthSnapshotService,
): InternalRuntimeHealthApi {
  return {
    async getRuntimeHealth(scope: ProbeScope): Promise<RuntimeProbeSummary["status"]> {
      const snapshot = await snapshots.getSnapshot(scope);
      return snapshot.summary.status;
    },

    async getRuntimeHealthSummary(scope: ProbeScope): Promise<RuntimeProbeSummary> {
      const snapshot = await snapshots.getSnapshot(scope);
      return snapshot.summary;
    },

    getRuntimeHealthMetadata(scope: ProbeScope): RuntimeHealthSnapshotMetadata {
      return snapshots.getSnapshotMetadata(scope);
    },

    async refreshRuntimeHealth(scope: ProbeScope): Promise<RuntimeHealthSnapshot> {
      return snapshots.refreshSnapshot(scope);
    },
  };
}

const defaultInternalRuntimeHealthApi = createInternalRuntimeHealthApi();

export const internalRuntimeHealthApi: InternalRuntimeHealthApi = {
  getRuntimeHealth: (scope) => defaultInternalRuntimeHealthApi.getRuntimeHealth(scope),
  getRuntimeHealthSummary: (scope) => defaultInternalRuntimeHealthApi.getRuntimeHealthSummary(scope),
  getRuntimeHealthMetadata: (scope) => defaultInternalRuntimeHealthApi.getRuntimeHealthMetadata(scope),
  refreshRuntimeHealth: (scope) => defaultInternalRuntimeHealthApi.refreshRuntimeHealth(scope),
};
