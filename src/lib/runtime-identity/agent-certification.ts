import "server-only";

import {
  getAgentRuntimeMappings,
  type AgentRuntimeMapping,
  type AgentRuntimeProofs,
} from "@/lib/runtime-identity/agent-mappings";
import type { RuntimeIdentity } from "@/lib/runtime-identity/model";
import { probeRuntimeIdentity } from "@/lib/runtime-identity/probe";
import {
  resolveRuntimeIdentity,
  type RuntimeEnvironment,
} from "@/lib/runtime-identity/resolver";
import {
  createRuntimeOutcomeId,
  createRuntimeConditionSnapshot,
  type RuntimeConditionSnapshot,
} from "@/lib/operational-runtime/certification";
import { AIOS_WORKFORCE } from "@/lib/workforce/registry";

/**
 * Versioned independently from deployment SHAs so Preview and Production can
 * prove that they executed the same certification semantics after squash merge.
 */
export const WORKFORCE_RUNTIME_CERTIFICATION_VERSION =
  "shared-runtime-snapshot-v1" as const;

export interface AgentRuntimeCertificationOptions {
  environment?: RuntimeEnvironment;
  providerIdentity?: RuntimeIdentity;
  observedAt?: string | Date;
  timeoutMs?: number;
  deploymentEnvironment?: string | null;
  deploymentSha?: string | null;
  probe?: typeof probeRuntimeIdentity;
}

export interface AgentRuntimeCertificationResult {
  requested: true;
  agentCount: number;
  healthy: number;
  degraded: number;
  blocked: number;
  unavailable: number;
  proofStrategy: "shared_runtime_snapshot";
  agentSpecificProbeCount: 0;
  providerProbeCount: 0 | 1;
  runtimeCondition: RuntimeConditionSnapshot;
  outcomeId: string;
  mappings: AgentRuntimeMapping[];
}

/**
 * Certifies every canonical agent against one authenticated observation of the
 * shared provider runtime. Individual agent prompts cannot prove capability
 * registration because they exercise the same model transport; repeating that
 * request per agent only creates stochastic, environment-dependent results.
 *
 * Deterministic handlers, connectors, approvals, and tools remain separately
 * identified as source proof until their own operational probes exist.
 */
export async function certifyAgentRuntimes(
  options: AgentRuntimeCertificationOptions = {},
): Promise<AgentRuntimeCertificationResult> {
  const environment = options.environment ?? process.env;
  const observedAt = options.observedAt ?? new Date();
  const configured = resolveRuntimeIdentity(environment, observedAt);
  const providerProbeCount = options.providerIdentity ? 0 : 1;
  const providerIdentity = options.providerIdentity ?? await (options.probe ?? probeRuntimeIdentity)({
    environment,
    observedAt,
    timeoutMs: Math.min(15_000, Math.max(250, options.timeoutMs ?? 5_000)),
    maxAttempts: 2,
  });
  const runtimeCondition = createRuntimeConditionSnapshot({
    identity: configured,
    logicVersion: WORKFORCE_RUNTIME_CERTIFICATION_VERSION,
    deploymentEnvironment: options.deploymentEnvironment ?? null,
    deploymentSha: options.deploymentSha ?? null,
  });
  const proofs = Object.fromEntries(
    AIOS_WORKFORCE.map((agent) => [agent.key, providerIdentity]),
  ) as AgentRuntimeProofs;
  const mappings = getAgentRuntimeMappings(providerIdentity, observedAt, proofs, {
    proofStrategy: "shared_runtime_snapshot",
    runtimeConditionId: runtimeCondition.conditionId,
  });

  // `configured` is deliberately resolved even when a proof is supplied. This
  // fail-closed check prevents callers from attaching proof from another safe
  // provider/deployment identity to the current environment.
  if (
    configured.provider !== providerIdentity.provider ||
    configured.model !== providerIdentity.model ||
    configured.deploymentName !== providerIdentity.deploymentName ||
    configured.endpointHostname !== providerIdentity.endpointHostname
  ) {
    const mismatchProof = {
      ...providerIdentity,
      status: "degraded" as const,
      inferenceStatus: "failed" as const,
      safeErrorCode: "runtime_configuration_identity_mismatch",
      safeMessage: "runtime_configuration_identity_mismatch",
    };
    const mismatchProofs = Object.fromEntries(
      AIOS_WORKFORCE.map((agent) => [agent.key, mismatchProof]),
    ) as AgentRuntimeProofs;
    const mismatchMappings = getAgentRuntimeMappings(configured, observedAt, mismatchProofs, {
      proofStrategy: "shared_runtime_snapshot",
      runtimeConditionId: runtimeCondition.conditionId,
    });
    return summarize(mismatchMappings, providerProbeCount, runtimeCondition);
  }

  return summarize(mappings, providerProbeCount, runtimeCondition);
}

function summarize(
  mappings: AgentRuntimeMapping[],
  providerProbeCount: 0 | 1,
  runtimeCondition: RuntimeConditionSnapshot,
): AgentRuntimeCertificationResult {
  const status: AgentRuntimeMapping["status"] = mappings.every(
    (mapping) => mapping.status === "healthy",
  )
    ? "healthy"
    : mappings.some((mapping) => mapping.status === "blocked")
      ? "blocked"
      : mappings.some((mapping) => mapping.status === "unavailable")
        ? "unavailable"
        : "degraded";
  return {
    requested: true,
    agentCount: mappings.length,
    healthy: mappings.filter((mapping) => mapping.status === "healthy").length,
    degraded: mappings.filter((mapping) => mapping.status === "degraded").length,
    blocked: mappings.filter((mapping) => mapping.status === "blocked").length,
    unavailable: mappings.filter((mapping) => mapping.status === "unavailable").length,
    proofStrategy: "shared_runtime_snapshot",
    agentSpecificProbeCount: 0,
    providerProbeCount,
    runtimeCondition,
    outcomeId: createRuntimeOutcomeId({
      conditionId: runtimeCondition.conditionId,
      status,
      safeErrorCode: mappings.find((mapping) => mapping.safeErrorCode)?.safeErrorCode ?? null,
      consumerOutcomes: mappings.map((mapping) => ({
        key: mapping.agentKey,
        status: mapping.status,
        safeErrorCode: mapping.safeErrorCode,
      })),
    }),
    mappings,
  };
}
