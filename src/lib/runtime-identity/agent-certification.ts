import "server-only";

import {
  getAgentRuntimeMappings,
  type AgentRuntimeMapping,
  type AgentRuntimeProofs,
} from "@/lib/runtime-identity/agent-mappings";
import type { RuntimeIdentity } from "@/lib/runtime-identity/model";
import {
  probeRuntimeIdentity,
  type RuntimeProbeOptions,
} from "@/lib/runtime-identity/probe";
import {
  resolveRuntimeIdentity,
  type RuntimeEnvironment,
} from "@/lib/runtime-identity/resolver";
import {
  AIOS_WORKFORCE,
  type AiosAgentKey,
} from "@/lib/workforce/registry";

const FIXED_AGENT_REQUEST =
  "Confirm only that this fixed, non-writing agent runtime probe can receive a response. Reply with OK.";

export const AGENT_RUNTIME_PROBE_SYSTEMS: Record<AiosAgentKey, string> = {
  harmony: "AIOS Harmony shared-runtime certification. Do not route work, call tools, or persist data. Reply only OK.",
  auditor: "AIOS Auditor shared-runtime certification. Do not inspect systems, call tools, or persist findings. Reply only OK.",
  mason: "AIOS Mason web-runtime certification. Do not plan engineering work, call tools, modify repositories, or create approvals. Reply only OK.",
  catalyst: "AIOS Catalyst shared-runtime certification. Do not create or publish content, call providers, or persist drafts. Reply only OK.",
  ambassador: "AIOS Ambassador shared-runtime certification. Do not contact people, call channels, or persist messages. Reply only OK.",
  atlas: "AIOS Atlas shared-runtime certification. Do not read or write Julius, memory, documents, or company data. Reply only OK.",
  pulse: "AIOS Pulse shared-runtime certification. Do not poll connectors, inspect telemetry, or emit alerts. Reply only OK.",
  horizon: "AIOS Horizon shared-runtime certification. Do not create plans, goals, scenarios, or work items. Reply only OK.",
  aegis: "AIOS Aegis shared-runtime certification. Do not inspect secrets, systems, permissions, or threats. Reply only OK.",
  ledger: "AIOS Ledger shared-runtime certification. Do not read or write approvals, audit trails, or activity records. Reply only OK.",
};

type ProbeFunction = (options: RuntimeProbeOptions) => Promise<RuntimeIdentity>;

export interface AgentRuntimeCertificationOptions {
  environment?: RuntimeEnvironment;
  providerIdentity?: RuntimeIdentity;
  observedAt?: string | Date;
  timeoutMs?: number;
  concurrency?: number;
  probe?: ProbeFunction;
}

export interface AgentRuntimeCertificationResult {
  requested: true;
  agentCount: number;
  healthy: number;
  degraded: number;
  blocked: number;
  unavailable: number;
  mappings: AgentRuntimeMapping[];
}

async function mapWithConcurrency<T, R>(
  entries: readonly T[],
  concurrency: number,
  mapper: (entry: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(entries.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;
      results[index] = await mapper(entries[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()),
  );
  return results;
}

/**
 * Runs fixed, non-writing model-transport probes for every canonical AIOS agent.
 * This does not execute tools or deterministic capabilities and never persists
 * prompts/responses. Those boundaries remain separately identified in mappings.
 */
export async function certifyAgentRuntimes(
  options: AgentRuntimeCertificationOptions = {},
): Promise<AgentRuntimeCertificationResult> {
  const environment = options.environment ?? process.env;
  const observedAt = options.observedAt ?? new Date();
  const providerIdentity = options.providerIdentity ?? resolveRuntimeIdentity(environment, observedAt);
  const probe = options.probe ?? probeRuntimeIdentity;
  const concurrency = Math.min(3, Math.max(1, options.concurrency ?? 2));
  const proofs = await mapWithConcurrency(
    AIOS_WORKFORCE,
    concurrency,
    async (agent) => [
      agent.key,
      await probe({
        environment,
        observedAt,
        timeoutMs: Math.min(10_000, Math.max(250, options.timeoutMs ?? 5_000)),
        maxAttempts: 1,
        fixedProbe: {
          request: FIXED_AGENT_REQUEST,
          system: AGENT_RUNTIME_PROBE_SYSTEMS[agent.key],
          observedBy: `runtime_identity.agent_probe.${agent.key}`,
        },
      }),
    ] as const,
  );
  const runtimeProofs = Object.fromEntries(proofs) as AgentRuntimeProofs;
  const mappings = getAgentRuntimeMappings(providerIdentity, observedAt, runtimeProofs);

  return {
    requested: true,
    agentCount: mappings.length,
    healthy: mappings.filter((mapping) => mapping.status === "healthy").length,
    degraded: mappings.filter((mapping) => mapping.status === "degraded").length,
    blocked: mappings.filter((mapping) => mapping.status === "blocked").length,
    unavailable: mappings.filter((mapping) => mapping.status === "unavailable").length,
    mappings,
  };
}
