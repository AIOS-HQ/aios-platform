import {
  getRuntimeProbeSummary,
  listRuntimeProbes,
  type RuntimeProbeAdapters,
} from "@/lib/runtime/probes/aggregate";
import type {
  ProbeCategory,
  ProbeScope,
  RuntimeProbeResult,
  RuntimeProbeSummary,
} from "@/lib/runtime/probes/types";

/**
 * Operational Runtime Probe Consumer Contract (Slice 5).
 *
 * Thin, read-only facade for consumers (dashboards, command centers, APIs) that
 * reuses Slice 1–4 authorization, adapters, aggregation, sanitization, and
 * deterministic ordering. This is the canonical consumer interface.
 */

export interface RuntimeConsumerService {
  listRuntimeProbes(scope: ProbeScope): Promise<RuntimeProbeResult[]>;
  getRuntimeSummary(scope: ProbeScope): Promise<RuntimeProbeSummary>;
  getRuntimeHealth(scope: ProbeScope): Promise<RuntimeProbeSummary["status"]>;
  getRuntimeCategory(scope: ProbeScope, category: ProbeCategory): Promise<RuntimeProbeSummary["categories"][number]>;
  getRuntimeProbe(scope: ProbeScope, probeId: string): Promise<RuntimeProbeResult | null>;
}

export function createRuntimeConsumerService(
  adapters?: RuntimeProbeAdapters,
): RuntimeConsumerService {
  return {
    async listRuntimeProbes(scope: ProbeScope): Promise<RuntimeProbeResult[]> {
      return listRuntimeProbes(scope, adapters);
    },

    async getRuntimeSummary(scope: ProbeScope): Promise<RuntimeProbeSummary> {
      return getRuntimeProbeSummary(scope, adapters);
    },

    async getRuntimeHealth(scope: ProbeScope): Promise<RuntimeProbeSummary["status"]> {
      const summary = await getRuntimeProbeSummary(scope, adapters);
      return summary.status;
    },

    async getRuntimeCategory(
      scope: ProbeScope,
      category: ProbeCategory,
    ): Promise<RuntimeProbeSummary["categories"][number]> {
      const summary = await getRuntimeProbeSummary(scope, adapters);
      return (
        summary.categories.find((c) => c.category === category) ?? {
          category,
          status: "unknown",
          total: 0,
          healthy: 0,
          degraded: 0,
          failed: 0,
          unknown: 0,
          stale: 0,
        }
      );
    },

    async getRuntimeProbe(scope: ProbeScope, probeId: string): Promise<RuntimeProbeResult | null> {
      const probes = await listRuntimeProbes(scope, adapters);
      return probes.find((p) => p.probeId === probeId) ?? null;
    },
  };
}

const defaultService = createRuntimeConsumerService();

export const runtimeProbeService = {
  listRuntimeProbes: (scope: ProbeScope) => defaultService.listRuntimeProbes(scope),
  getRuntimeSummary: (scope: ProbeScope) => defaultService.getRuntimeSummary(scope),
  getRuntimeHealth: (scope: ProbeScope) => defaultService.getRuntimeHealth(scope),
  getRuntimeCategory: (scope: ProbeScope, category: ProbeCategory) =>
    defaultService.getRuntimeCategory(scope, category),
  getRuntimeProbe: (scope: ProbeScope, probeId: string) => defaultService.getRuntimeProbe(scope, probeId),
};
