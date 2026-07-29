import { runtimeProbeService } from "@/lib/runtime/probes/service";
import type {
  ProbeCategory,
  ProbeScope,
  RuntimeProbeResult,
  RuntimeProbeSummary,
} from "@/lib/runtime/probes/types";

/**
 * Operational Runtime Health Orchestrator (6C.2 Slice 1).
 *
 * Canonical internal entrypoint for runtime health reads. Thin facade only:
 * delegates to Slice 5 Runtime Consumer Service so authorization, scope
 * pinning, sanitization, deterministic ordering, and status precedence are
 * preserved from the existing probe stack.
 */

export interface RuntimeHealthOrchestrator {
  getHealth(scope: ProbeScope): Promise<RuntimeProbeSummary["status"]>;
  getSummary(scope: ProbeScope): Promise<RuntimeProbeSummary>;
  getCategory(
    scope: ProbeScope,
    category: ProbeCategory,
  ): Promise<RuntimeProbeSummary["categories"][number]>;
  getProbe(scope: ProbeScope, probeId: string): Promise<RuntimeProbeResult | null>;
  listProbes(scope: ProbeScope): Promise<RuntimeProbeResult[]>;
}

export function createRuntimeHealthOrchestrator(): RuntimeHealthOrchestrator {
  return {
    async getHealth(scope: ProbeScope): Promise<RuntimeProbeSummary["status"]> {
      return runtimeProbeService.getRuntimeHealth(scope);
    },

    async getSummary(scope: ProbeScope): Promise<RuntimeProbeSummary> {
      return runtimeProbeService.getRuntimeSummary(scope);
    },

    async getCategory(
      scope: ProbeScope,
      category: ProbeCategory,
    ): Promise<RuntimeProbeSummary["categories"][number]> {
      return runtimeProbeService.getRuntimeCategory(scope, category);
    },

    async getProbe(
      scope: ProbeScope,
      probeId: string,
    ): Promise<RuntimeProbeResult | null> {
      return runtimeProbeService.getRuntimeProbe(scope, probeId);
    },

    async listProbes(scope: ProbeScope): Promise<RuntimeProbeResult[]> {
      return runtimeProbeService.listRuntimeProbes(scope);
    },
  };
}

const defaultRuntimeHealthOrchestrator = createRuntimeHealthOrchestrator();

export const runtimeHealthOrchestrator = {
  getHealth: (scope: ProbeScope) => defaultRuntimeHealthOrchestrator.getHealth(scope),
  getSummary: (scope: ProbeScope) => defaultRuntimeHealthOrchestrator.getSummary(scope),
  getCategory: (scope: ProbeScope, category: ProbeCategory) =>
    defaultRuntimeHealthOrchestrator.getCategory(scope, category),
  getProbe: (scope: ProbeScope, probeId: string) =>
    defaultRuntimeHealthOrchestrator.getProbe(scope, probeId),
  listProbes: (scope: ProbeScope) => defaultRuntimeHealthOrchestrator.listProbes(scope),
};
