import "server-only";

import {
  createCanonicalWorkforceEnvelope,
  readCanonicalWorkforceEnvelope,
  transitionCanonicalWorkforceEnvelope,
} from "@/lib/harmony/agents/a2a";
import { evaluateAutonomyPolicy } from "@/lib/harmony/autonomy/policy-engine";
import { ensureProvidersRegistered } from "@/lib/integrations/providers";
import { listConnectorDefinitions } from "@/lib/integrations/registry";
import { discoverCapabilities } from "@/lib/integrations/runtime/capabilities";
import { hasCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { getEventMeshConfig } from "@/lib/event-mesh/config";
import { createClient } from "@/lib/supabase/server";
import type { EvidenceStatus, EvidenceType } from "@/lib/evidence/model";
import type { RuntimeIdentity, RuntimeLatencyBucket } from "@/lib/runtime-identity/model";
import {
  OPERATIONAL_RUNTIME_COMPONENTS,
  createOperationalRuntimeCertification,
  createRuntimeConditionSnapshot,
  createRuntimeOutcomeId,
  type OperationalCapabilityEvidence,
  type OperationalRuntimeCertification,
  type OperationalRuntimeComponent,
  type RuntimeConditionSnapshot,
} from "@/lib/operational-runtime/certification";

export const OPERATIONAL_RUNTIME_PROBE_VERSION = "operational-live-probe-v1";

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

interface ProbeSupabaseClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from(table: string): {
    select(columns: string): { limit(count: number): Promise<QueryResult> };
  };
  rpc(name: string): Promise<QueryResult>;
}

export interface OperationalProbeDependencies {
  createSupabaseClient?: () => Promise<ProbeSupabaseClient>;
  clock?: () => number;
  timeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
}

export interface OperationalRuntimeCertificationSummary {
  requested: true;
  componentCount: number;
  healthy: number;
  degraded: number;
  blocked: number;
  unavailable: number;
  unknown: number;
  runtimeCondition: RuntimeConditionSnapshot;
  outcomeId: string;
  components: OperationalRuntimeCertification[];
}

class SafeProbeFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function latencyBucket(durationMs: number): RuntimeLatencyBucket {
  if (durationMs < 1_000) return "under_1s";
  if (durationMs < 3_000) return "1s_to_3s";
  if (durationMs < 10_000) return "3s_to_10s";
  return "over_10s";
}

async function bounded<T>(work: () => Promise<T> | T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SafeProbeFailure("operational_probe_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function capability(
  name: string,
  status: EvidenceStatus,
  evidenceType: EvidenceType,
  safeMessage: string,
): OperationalCapabilityEvidence {
  return { capability: name, status, evidenceType, safeMessage };
}

async function zeroRowRead(client: ProbeSupabaseClient, table: string): Promise<void> {
  const { error } = await client.from(table).select("id").limit(0);
  if (error) throw new SafeProbeFailure(`${table}_read_unavailable`);
}

function failureCode(error: unknown): string {
  return error instanceof SafeProbeFailure ? error.code : "operational_probe_failed";
}

async function runHarmonyProbe(): Promise<OperationalCapabilityEvidence[]> {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const envelope = createCanonicalWorkforceEnvelope({
    messageId: "runtime-certification",
    userId: "runtime-certification",
    companyId: "runtime-certification",
    fromAgent: "harmony",
    toAgent: "auditor",
    kind: "task",
    risk: "routine",
    approvalRequired: false,
    now,
  });
  const acknowledged = transitionCanonicalWorkforceEnvelope(envelope, "acknowledged", { now });
  const parsed = readCanonicalWorkforceEnvelope({ context: { envelope: acknowledged } });
  if (!parsed || parsed.execution.status !== "acknowledged" || !parsed.delivery.ackReceived) {
    throw new SafeProbeFailure("harmony_orchestration_contract_failed");
  }
  if (!parsed.policy.companyScopeEnforced || parsed.actor.fromAgent !== "harmony") {
    throw new SafeProbeFailure("harmony_routing_contract_failed");
  }
  return [
    capability("routing", "healthy", "live_runtime_proof", "harmony_routing_probe_succeeded"),
    capability("delegation", "healthy", "live_runtime_proof", "harmony_delegation_probe_succeeded"),
    capability("work_coordination", "healthy", "live_runtime_proof", "harmony_coordination_probe_succeeded"),
  ];
}

async function runJuliusProbe(client: ProbeSupabaseClient): Promise<OperationalCapabilityEvidence[]> {
  await zeroRowRead(client, "julius_entries");
  return [
    capability("company_scoped_retrieval", "degraded", "authenticated_runtime_proof", "julius_schema_readiness_verified_without_customer_retrieval"),
    capability("permission_enforcement", "unknown", "source_code_proof", "julius_rls_requires_separate_isolation_certification"),
  ];
}

async function runConnectorProbe(): Promise<OperationalCapabilityEvidence[]> {
  ensureProvidersRegistered();
  const definitions = listConnectorDefinitions();
  const capabilities = discoverCapabilities();
  const wired = capabilities.filter(({ connector, capability: item }) =>
    hasCapabilityHandler(connector.id, item.id));
  if (definitions.length === 0 || capabilities.length === 0 || wired.length === 0) {
    throw new SafeProbeFailure("connector_runtime_registry_unavailable");
  }
  return [
    capability("capability_registration", "healthy", "live_runtime_proof", "connector_capability_registry_probe_succeeded"),
    capability("readiness", "healthy", "live_runtime_proof", "connector_handler_runtime_probe_succeeded"),
    capability("safe_execution", "unknown", "source_code_proof", "connector_external_execution_not_invoked_by_read_only_probe"),
  ];
}

async function runApprovalProbe(client: ProbeSupabaseClient): Promise<OperationalCapabilityEvidence[]> {
  await Promise.all([
    zeroRowRead(client, "approvals"),
    zeroRowRead(client, "approval_payloads"),
  ]);
  const decision = evaluateAutonomyPolicy({
    actor: "harmony",
    agent: "catalyst",
    domain: "content",
    action: "publish_externally",
    current_autonomy_level: 3,
  });
  if (decision.decision !== "approval_required") {
    throw new SafeProbeFailure("approval_policy_gate_failed");
  }
  return [
    capability("read_visibility", "healthy", "authenticated_runtime_proof", "approval_schema_readiness_probe_succeeded"),
    capability("policy_gate", "healthy", "live_runtime_proof", "approval_policy_gate_probe_succeeded"),
    capability("decision_enforcement", "unknown", "source_code_proof", "approval_decision_mutation_not_invoked_by_read_only_probe"),
  ];
}

async function runSupabaseProbe(client: ProbeSupabaseClient, expectedUserId: string): Promise<OperationalCapabilityEvidence[]> {
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user || auth.data.user.id !== expectedUserId) {
    throw new SafeProbeFailure("supabase_authenticated_session_unavailable");
  }
  await zeroRowRead(client, "companies");
  return [
    capability("connectivity", "healthy", "authenticated_runtime_proof", "supabase_authenticated_connectivity_probe_succeeded"),
    capability("tenant_isolation", "unknown", "source_code_proof", "supabase_cross_tenant_probe_not_permitted"),
    capability("rls_enforcement", "degraded", "authenticated_runtime_proof", "supabase_rls_query_path_verified_without_customer_rows"),
  ];
}

async function runEventMeshProbe(
  client: ProbeSupabaseClient,
  environment: NodeJS.ProcessEnv,
): Promise<OperationalCapabilityEvidence[]> {
  const config = getEventMeshConfig(environment);
  if (config.provider !== "postgres") {
    throw new SafeProbeFailure(
      config.provider === "nats"
        ? "event_mesh_nats_health_is_not_read_only"
        : "event_mesh_nonproduction_provider_not_certifiable",
    );
  }
  const { data, error } = await client.rpc("event_mesh_health");
  if (error || !data || typeof data !== "object") {
    throw new SafeProbeFailure("event_mesh_health_unavailable");
  }
  const workerCount = (data as { workerCount?: unknown }).workerCount;
  const heartbeatHealthy = typeof workerCount === "number" && workerCount > 0;
  return [
    capability("health", heartbeatHealthy ? "healthy" : "degraded", "authenticated_runtime_proof", heartbeatHealthy ? "event_mesh_worker_heartbeat_observed" : "event_mesh_worker_heartbeat_missing"),
    capability("dispatch", "unknown", "source_code_proof", "event_mesh_dispatch_not_invoked_by_read_only_probe"),
    capability("consumer_delivery", "unknown", "source_code_proof", "event_mesh_delivery_not_invoked_by_read_only_probe"),
  ];
}

function overallStatus(results: readonly OperationalCapabilityEvidence[]): EvidenceStatus {
  if (results.some((item) => item.status === "blocked")) return "blocked";
  if (results.some((item) => item.status === "unavailable")) return "unavailable";
  if (results.every((item) => item.status === "healthy")) return "healthy";
  return "degraded";
}

export async function certifyOperationalRuntimes(input: {
  providerIdentity: RuntimeIdentity;
  userId: string;
  observedAt?: string | Date;
  deploymentEnvironment?: string | null;
  deploymentSha?: string | null;
  dependencies?: OperationalProbeDependencies;
}): Promise<OperationalRuntimeCertificationSummary> {
  const observedAt = input.observedAt ?? new Date();
  const dependencies = input.dependencies ?? {};
  const timeoutMs = Math.min(5_000, Math.max(250, dependencies.timeoutMs ?? 3_000));
  const clock = dependencies.clock ?? (() => performance.now());
  const runtimeCondition = createRuntimeConditionSnapshot({
    identity: input.providerIdentity,
    logicVersion: OPERATIONAL_RUNTIME_PROBE_VERSION,
    deploymentEnvironment: input.deploymentEnvironment,
    deploymentSha: input.deploymentSha,
  });
  const createSupabaseClient = dependencies.createSupabaseClient ?? (
    createClient as unknown as () => Promise<ProbeSupabaseClient>
  );
  let clientPromise: Promise<ProbeSupabaseClient> | null = null;
  const getClient = () => {
    clientPromise ??= createSupabaseClient();
    return clientPromise;
  };

  const probes: Record<OperationalRuntimeComponent, () => Promise<OperationalCapabilityEvidence[]>> = {
    harmony_orchestration: runHarmonyProbe,
    julius_retrieval: async () => runJuliusProbe(await getClient()),
    connector_runtime: runConnectorProbe,
    approval_runtime: async () => runApprovalProbe(await getClient()),
    supabase_runtime: async () => runSupabaseProbe(await getClient(), input.userId),
    event_mesh_runtime: async () => runEventMeshProbe(await getClient(), dependencies.environment ?? process.env),
  };

  const components: OperationalRuntimeCertification[] = [];
  for (const component of OPERATIONAL_RUNTIME_COMPONENTS) {
    const started = clock();
    try {
      const capabilityEvidence = await bounded(probes[component], timeoutMs);
      const status = overallStatus(capabilityEvidence);
      const evidenceType = capabilityEvidence.some((item) => item.evidenceType === "authenticated_runtime_proof")
        ? "authenticated_runtime_proof"
        : "live_runtime_proof";
      components.push(createOperationalRuntimeCertification({
        component,
        status,
        evidenceType,
        observedBy: `operational_runtime.probe.${component}`,
        confidence: status === "healthy" ? 0.95 : 0.85,
        observedAt,
        liveProbeRequired: true,
        liveProbeAttempted: true,
        capabilityEvidence,
        sharedProviderRuntimeId: input.providerIdentity.runtimeId,
        latencyBucket: latencyBucket(Math.max(0, clock() - started)),
        runtimeConditionId: runtimeCondition.conditionId,
        safeMessage: status === "healthy" ? `${component}_probe_succeeded` : `${component}_probe_partially_verified`,
      }));
    } catch (error) {
      const code = failureCode(error);
      const evidenceType: EvidenceType = component === "harmony_orchestration" || component === "connector_runtime"
        ? "live_runtime_proof"
        : code.startsWith("event_mesh_nats_") || code.startsWith("event_mesh_nonproduction_")
          ? "configuration_proof"
          : "authenticated_runtime_proof";
      components.push(createOperationalRuntimeCertification({
        component,
        status: code === "operational_probe_timeout" ? "unavailable" : "degraded",
        evidenceType,
        observedBy: `operational_runtime.probe.${component}`,
        confidence: 0.8,
        observedAt,
        liveProbeRequired: true,
        liveProbeAttempted: true,
        sharedProviderRuntimeId: input.providerIdentity.runtimeId,
        latencyBucket: latencyBucket(Math.max(0, clock() - started)),
        runtimeConditionId: runtimeCondition.conditionId,
        safeErrorCode: code,
        safeMessage: `${component}_probe_failed`,
      }));
    }
  }

  const counts = (status: EvidenceStatus) => components.filter((item) => item.status === status).length;
  const outcomeId = createRuntimeOutcomeId({
    conditionId: runtimeCondition.conditionId,
    status: components.every((item) => item.status === "healthy") ? "healthy" : "degraded",
    safeErrorCode: null,
    consumerOutcomes: components.map((item) => ({
      key: item.component,
      status: item.status,
      safeErrorCode: item.safeErrorCode,
    })),
  });
  return {
    requested: true,
    componentCount: components.length,
    healthy: counts("healthy"),
    degraded: counts("degraded"),
    blocked: counts("blocked"),
    unavailable: counts("unavailable"),
    unknown: counts("unknown"),
    runtimeCondition,
    outcomeId,
    components,
  };
}
