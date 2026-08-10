import "server-only";

import {
  createRuntimeConditionSnapshot,
  createRuntimeOutcomeId,
  createOperationalRuntimeCertification,
  OPERATIONAL_RUNTIME_COMPONENTS,
  type OperationalRuntimeComponent,
  type OperationalRuntimeCertification,
  type RuntimeConditionSnapshot,
} from "@/lib/operational-runtime/certification";
import { buildAutonomousExecutionOrchestration } from "@/lib/harmony/autonomous-execution-orchestrator";
import { getConnectorHealth } from "@/lib/integrations/connector-health";
import { searchJuliusSemantic } from "@/lib/julius/service";
import { getEventMeshOperationsSummary } from "@/lib/event-mesh/operations";
import { listApprovalsUnified } from "@/lib/data/os/approvals";
import { runSupabaseDiagnostics } from "@/lib/integrations/clients/supabase-diagnostics";
import { createClient } from "@/lib/supabase/server";
import { resolveRuntimeIdentity } from "@/lib/runtime-identity/resolver";
import type { RuntimeLatencyBucket } from "@/lib/runtime-identity/model";

export type LiveProbeResult = {
  status: "healthy" | "degraded" | "blocked" | "unavailable" | "unknown";
  evidenceType: "live_runtime_proof" | "authenticated_runtime_proof" | "source_code_proof" | "unknown";
  safeMessage: string;
  safeErrorCode?: string | null;
  observedAt?: Date;
  observedBy: string;
  confidence?: number;
  liveProbeAttempted: boolean;
};

function toCanonicalLatencyBucket(elapsedMs: number): NonNullable<RuntimeLatencyBucket> {
  if (elapsedMs < 1000) {
    return "under_1s";
  }
  if (elapsedMs < 3000) {
    return "1s_to_3s";
  }
  if (elapsedMs < 10000) {
    return "3s_to_10s";
  }
  return "over_10s";
}

export type LiveCertificationInput = {
  userId: string;
  companyId?: string | null;
  deploymentEnvironment: string;
  deploymentSha: string;
  observedAt?: Date;
};

export type LiveCertificationAdapters = {
  probeHarmonyOrchestration: (input: LiveCertificationInput) => Promise<LiveProbeResult>;
  probeJuliusRetrieval: (input: LiveCertificationInput) => Promise<LiveProbeResult>;
  probeConnectorRuntime: (input: LiveCertificationInput) => Promise<LiveProbeResult>;
  probeApprovalRuntime: (input: LiveCertificationInput) => Promise<LiveProbeResult>;
  probeSupabaseRuntime: (input: LiveCertificationInput) => Promise<LiveProbeResult>;
  probeEventMeshRuntime: (input: LiveCertificationInput) => Promise<LiveProbeResult>;
};

export type LiveCertificationSummary = {
  componentCount: number;
  healthy: number;
  degraded: number;
  blocked: number;
  unavailable: number;
  unknown: number;
};

export type OperationalRuntimeLiveCertificationResult = {
  deploymentEnvironment: string;
  deploymentSha: string;
  runtimeCondition: RuntimeConditionSnapshot;
  outcomeId: string;
  summary: LiveCertificationSummary;
  foundation: (OperationalRuntimeCertification & { latencyBucket: NonNullable<RuntimeLatencyBucket> })[];
  certifiable: boolean;
};

const PROBE_OBSERVED_BY: Record<OperationalRuntimeComponent, string> = {
  harmony_orchestration: "operational_runtime.live_probe.harmony_orchestration",
  julius_retrieval: "operational_runtime.live_probe.julius_retrieval",
  connector_runtime: "operational_runtime.live_probe.connector_runtime",
  approval_runtime: "operational_runtime.live_probe.approval_runtime",
  supabase_runtime: "operational_runtime.live_probe.supabase_runtime",
  event_mesh_runtime: "operational_runtime.live_probe.event_mesh_runtime",
};

function defaultProbe(component: OperationalRuntimeComponent): (input: LiveCertificationInput) => Promise<LiveProbeResult> {
  return async (input) => {
    const observedAt = input.observedAt ?? new Date();

    if (component === "harmony_orchestration") {
      const plan = await buildAutonomousExecutionOrchestration({
        userId: input.userId,
        companyId: input.companyId ?? null,
        objective: "M5E production post-live probe",
      });
      return {
        status: plan.phases.length > 0 ? "healthy" : "unknown",
        evidenceType: "authenticated_runtime_proof",
        safeMessage: plan.phases.length > 0
          ? "harmony_orchestration_probe_executed"
          : "harmony_orchestration_no_phases",
        safeErrorCode: plan.phases.length > 0 ? null : "harmony_orchestration_no_phases",
        observedAt,
        observedBy: PROBE_OBSERVED_BY[component],
        confidence: plan.phases.length > 0 ? 0.85 : 0.5,
        liveProbeAttempted: true,
      };
    }

    if (component === "julius_retrieval") {
      const companyId = (input.companyId ?? "").trim();
      if (!companyId) {
        return {
          status: "unknown",
          evidenceType: "unknown",
          safeMessage: "julius_retrieval_company_id_missing",
          safeErrorCode: "company_id_missing",
          observedAt,
          observedBy: PROBE_OBSERVED_BY[component],
          confidence: 0,
            liveProbeAttempted: false,
        };
      }

      const results = await searchJuliusSemantic(
        input.userId,
        companyId,
        "M5E production post-live probe",
        1,
      );
      const semanticHit = results.find((row) => typeof row.similarity === "number" && Number.isFinite(row.similarity));
      return {
        status: semanticHit ? "healthy" : "unknown",
        evidenceType: "authenticated_runtime_proof",
        safeMessage: semanticHit
          ? "julius_retrieval_semantic_probe_executed"
          : "julius_retrieval_semantic_similarity_unavailable",
        safeErrorCode: semanticHit ? null : "semantic_similarity_missing",
        observedAt,
        observedBy: PROBE_OBSERVED_BY[component],
        confidence: semanticHit ? 0.85 : 0.5,
        liveProbeAttempted: true,
      };
    }

    if (component === "connector_runtime") {
      const rows = await getConnectorHealth(input.userId);
      if (rows.length === 0) {
        return {
          status: "unknown",
          evidenceType: "unknown",
          safeMessage: "connector_runtime_no_connections",
          safeErrorCode: "no_connector_rows",
          observedAt,
          observedBy: PROBE_OBSERVED_BY[component],
          confidence: 0.4,
            liveProbeAttempted: true,
        };
      }
      const hasFailed = rows.some((row) => row.state === "needs_reauth" || row.state === "setup_required" || row.state === "unknown");
      const hasDegraded = rows.some((row) => row.state === "plaintext_token" || row.state === "expired_refreshable");
      return {
        status: hasFailed ? "blocked" : hasDegraded ? "degraded" : "healthy",
        evidenceType: "authenticated_runtime_proof",
        safeMessage: hasFailed ? "connector_runtime_blocked" : hasDegraded ? "connector_runtime_degraded" : "connector_runtime_ok",
        safeErrorCode: hasFailed ? "connector_state_blocked" : hasDegraded ? "connector_state_degraded" : null,
        observedAt,
        observedBy: PROBE_OBSERVED_BY[component],
        confidence: hasFailed ? 0.6 : 0.9,
        liveProbeAttempted: true,
      };
    }

    if (component === "approval_runtime") {
      const approvals = await listApprovalsUnified({ companyId: input.companyId ?? undefined });
      return {
        status: Array.isArray(approvals) ? "healthy" : "unknown",
        evidenceType: "authenticated_runtime_proof",
        safeMessage: "approval_runtime_unified_list_read_executed",
        safeErrorCode: null,
        observedAt,
        observedBy: PROBE_OBSERVED_BY[component],
        confidence: 0.85,
        liveProbeAttempted: true,
      };
    }

    if (component === "supabase_runtime") {
      const diagnostics = await runSupabaseDiagnostics(input.userId);
      const dbHealth = diagnostics.items.find((item) => item.id === "db_health_check")?.ok === true;
      const rlsHealth = diagnostics.items.find((item) => item.id === "rls_diagnostics")?.ok === true;

      const supabase = await createClient();
      const companyProbe = input.companyId
        ? await supabase.from("companies").select("id").eq("id", input.companyId).limit(1)
        : await supabase.from("companies").select("id").limit(1);
      const rlsReadOk = !companyProbe.error;

      if (!dbHealth || !rlsHealth || !rlsReadOk) {
        return {
          status: "blocked",
          evidenceType: "authenticated_runtime_proof",
          safeMessage: "supabase_runtime_probe_failed",
          safeErrorCode: !dbHealth ? "supabase_db_health_failed" : !rlsHealth ? "supabase_rls_diagnostics_failed" : "supabase_rls_read_failed",
          observedAt,
          observedBy: PROBE_OBSERVED_BY[component],
          confidence: 0.5,
            liveProbeAttempted: true,
        };
      }

      return {
        status: "healthy",
        evidenceType: "authenticated_runtime_proof",
        safeMessage: "supabase_runtime_db_and_rls_probe_ok",
        safeErrorCode: null,
        observedAt,
        observedBy: PROBE_OBSERVED_BY[component],
        confidence: 0.9,
        liveProbeAttempted: true,
      };
    }

    const summary = await getEventMeshOperationsSummary();
    return {
      status: summary.status === "healthy" ? "healthy" : summary.status === "degraded" ? "degraded" : "unavailable",
      evidenceType: "authenticated_runtime_proof",
      safeMessage: summary.status === "healthy" ? "event_mesh_runtime_ok" : "event_mesh_runtime_not_healthy",
      safeErrorCode: summary.status === "healthy" ? null : `event_mesh_${summary.status}`,
      observedAt,
      observedBy: PROBE_OBSERVED_BY[component],
      confidence: summary.status === "healthy" ? 0.9 : 0.6,
      liveProbeAttempted: true,
    };
  };
}

export const defaultLiveCertificationAdapters: LiveCertificationAdapters = {
  probeHarmonyOrchestration: defaultProbe("harmony_orchestration"),
  probeJuliusRetrieval: defaultProbe("julius_retrieval"),
  probeConnectorRuntime: defaultProbe("connector_runtime"),
  probeApprovalRuntime: defaultProbe("approval_runtime"),
  probeSupabaseRuntime: defaultProbe("supabase_runtime"),
  probeEventMeshRuntime: defaultProbe("event_mesh_runtime"),
};

function normalizeProbeForEvidence(component: OperationalRuntimeComponent, probe: LiveProbeResult): LiveProbeResult {
  const allowsHealthy =
    probe.liveProbeAttempted === true &&
    (probe.evidenceType === "live_runtime_proof" || probe.evidenceType === "authenticated_runtime_proof");

  if (probe.status === "healthy" && !allowsHealthy) {
    return {
      status: "unknown",
      evidenceType: probe.evidenceType === "source_code_proof" ? "source_code_proof" : "unknown",
      safeMessage: `${component}_healthy_without_live_probe_rejected`,
      safeErrorCode: "live_probe_required_for_healthy",
      observedAt: probe.observedAt,
      observedBy: probe.observedBy,
      confidence: probe.confidence,
      liveProbeAttempted: probe.liveProbeAttempted,
    };
  }

  return probe;
}

function fallbackProbe(component: OperationalRuntimeComponent, observedAt: Date, error: unknown): LiveProbeResult {
  void error;
  return {
    status: "unknown",
    evidenceType: "unknown",
    safeMessage: `${component}_probe_execution_failed`,
    safeErrorCode: "probe_execution_failed",
    observedAt,
    observedBy: PROBE_OBSERVED_BY[component],
    confidence: 0,
    liveProbeAttempted: false,
  };
}

async function executeMeasuredProbe(
  component: OperationalRuntimeComponent,
  input: LiveCertificationInput,
  probeFn: (ctx: LiveCertificationInput) => Promise<LiveProbeResult>,
): Promise<LiveProbeResult> {
  try {
    const probe = await probeFn(input);
    return probe;
  } catch (error) {
    const fallback = fallbackProbe(component, input.observedAt ?? new Date(), error);
    return fallback;
  }
}

export async function certifyOperationalRuntimeLive(
  input: LiveCertificationInput,
  adapters: LiveCertificationAdapters = defaultLiveCertificationAdapters,
): Promise<OperationalRuntimeLiveCertificationResult> {
  const observedAt = input.observedAt ?? new Date();
  const runtimeIdentity = resolveRuntimeIdentity(process.env, observedAt);

  const runtimeCondition = createRuntimeConditionSnapshot({
    identity: runtimeIdentity,
    logicVersion: "operational-runtime-live-v1",
    deploymentEnvironment: input.deploymentEnvironment,
    deploymentSha: input.deploymentSha,
  });

  const adapterMap: Record<OperationalRuntimeComponent, (ctx: LiveCertificationInput) => Promise<LiveProbeResult>> = {
    harmony_orchestration: adapters.probeHarmonyOrchestration,
    julius_retrieval: adapters.probeJuliusRetrieval,
    connector_runtime: adapters.probeConnectorRuntime,
    approval_runtime: adapters.probeApprovalRuntime,
    supabase_runtime: adapters.probeSupabaseRuntime,
    event_mesh_runtime: adapters.probeEventMeshRuntime,
  };

  const seen = new Set<string>();
  const foundation: (OperationalRuntimeCertification & { latencyBucket: NonNullable<RuntimeLatencyBucket> })[] = [];

  for (const component of OPERATIONAL_RUNTIME_COMPONENTS) {
    if (seen.has(component)) {
      throw new Error("duplicate_component_probe");
    }
    seen.add(component);

    const probeStart = Date.now();
    const rawProbe = await executeMeasuredProbe(component, input, adapterMap[component]);
    const measuredLatencyBucket = toCanonicalLatencyBucket(Math.max(0, Date.now() - probeStart));

    const probe = normalizeProbeForEvidence(component, rawProbe);

    const certification = createOperationalRuntimeCertification({
      component,
      status: probe.status,
      evidenceType: probe.evidenceType,
      observedAt: probe.observedAt ?? observedAt,
      observedBy: probe.observedBy,
      confidence: probe.confidence ?? 0,
      liveProbeRequired: true,
      liveProbeAttempted: probe.status === "healthy" ? true : probe.liveProbeAttempted,
      runtimeConditionId: runtimeCondition.conditionId,
      safeErrorCode: probe.safeErrorCode ?? null,
      safeMessage: probe.safeMessage,
    });

    foundation.push({
      ...certification,
      latencyBucket: measuredLatencyBucket,
    });
  }

  if (foundation.length !== OPERATIONAL_RUNTIME_COMPONENTS.length) {
    throw new Error("component_probe_count_invalid");
  }

  const summary: LiveCertificationSummary = {
    componentCount: foundation.length,
    healthy: foundation.filter((entry) => entry.status === "healthy").length,
    degraded: foundation.filter((entry) => entry.status === "degraded").length,
    blocked: foundation.filter((entry) => entry.status === "blocked").length,
    unavailable: foundation.filter((entry) => entry.status === "unavailable").length,
    unknown: foundation.filter((entry) => entry.status === "unknown").length,
  };

  const normalizedOverallStatus =
    summary.blocked > 0
      ? "blocked"
      : summary.unavailable > 0
        ? "unavailable"
        : summary.degraded > 0
          ? "degraded"
          : summary.unknown > 0
            ? "unknown"
            : "healthy";

  const componentByName = new Map(foundation.map((entry) => [entry.component, entry]));
  const normalizedConsumerOutcomes = OPERATIONAL_RUNTIME_COMPONENTS.map((component) => {
    const entry = componentByName.get(component);
    if (!entry) {
      throw new Error(`missing_component_outcome:${component}`);
    }
    return {
      key: component,
      status: entry.status,
      safeErrorCode: entry.safeErrorCode,
    };
  });

  const outcomeId = createRuntimeOutcomeId({
    conditionId: runtimeCondition.conditionId,
    status: normalizedOverallStatus,
    safeErrorCode: null,
    consumerOutcomes: normalizedConsumerOutcomes,
  });

  const certifiable =
    summary.componentCount === 6 &&
    summary.healthy === 6 &&
    summary.degraded === 0 &&
    summary.blocked === 0 &&
    summary.unavailable === 0 &&
    summary.unknown === 0;

  return {
    deploymentEnvironment: input.deploymentEnvironment,
    deploymentSha: input.deploymentSha,
    runtimeCondition,
    outcomeId,
    summary,
    foundation,
    certifiable,
  };
}
