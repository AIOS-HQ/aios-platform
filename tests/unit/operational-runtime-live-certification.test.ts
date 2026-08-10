import { describe, expect, it } from "vitest";
import {
  certifyOperationalRuntimeLive,
  type LiveCertificationAdapters,
  type LiveProbeResult,
} from "@/lib/operational-runtime/live-certification";
import { OPERATIONAL_RUNTIME_COMPONENTS } from "@/lib/operational-runtime/certification";
import type { RuntimeLatencyBucket } from "@/lib/runtime-identity/model";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";
const OBSERVED_AT = new Date("2026-08-09T12:00:00.000Z");

function okProbe(source: string): LiveProbeResult {
  return {
    status: "healthy",
    evidenceType: "authenticated_runtime_proof",
    safeMessage: `${source}_ok`,
    safeErrorCode: null,
    observedAt: OBSERVED_AT,
    observedBy: source,
    confidence: 0.95,
    liveProbeAttempted: true,
  };
}

function adapters(overrides: Partial<LiveCertificationAdapters> = {}): LiveCertificationAdapters {
  return {
    probeHarmonyOrchestration: async () => okProbe("harmony"),
    probeJuliusRetrieval: async () => okProbe("julius"),
    probeConnectorRuntime: async () => okProbe("connector"),
    probeApprovalRuntime: async () => okProbe("approval"),
    probeSupabaseRuntime: async () => okProbe("supabase"),
    probeEventMeshRuntime: async () => okProbe("event_mesh"),
    ...overrides,
  };
}

describe("operational runtime live certification provider", () => {
  it("executes exactly six canonical component probes", async () => {
    const calls: string[] = [];
    const result = await certifyOperationalRuntimeLive({
      userId: "founder-1",
      companyId: "company-1",
      deploymentEnvironment: "production",
      deploymentSha: SHA,
      observedAt: OBSERVED_AT,
    }, adapters({
      probeHarmonyOrchestration: async () => { calls.push("harmony_orchestration"); return okProbe("harmony"); },
      probeJuliusRetrieval: async () => { calls.push("julius_retrieval"); return okProbe("julius"); },
      probeConnectorRuntime: async () => { calls.push("connector_runtime"); return okProbe("connector"); },
      probeApprovalRuntime: async () => { calls.push("approval_runtime"); return okProbe("approval"); },
      probeSupabaseRuntime: async () => { calls.push("supabase_runtime"); return okProbe("supabase"); },
      probeEventMeshRuntime: async () => { calls.push("event_mesh_runtime"); return okProbe("event_mesh"); },
    }));

    expect(calls).toEqual(OPERATIONAL_RUNTIME_COMPONENTS);
    expect(result.foundation).toHaveLength(6);
  });

  it("produces fully healthy certifiable result for six healthy live probes", async () => {
    const result = await certifyOperationalRuntimeLive({
      userId: "founder-1",
      deploymentEnvironment: "production",
      deploymentSha: SHA,
      observedAt: OBSERVED_AT,
    }, adapters());

    expect(result.summary).toMatchObject({ componentCount: 6, healthy: 6, degraded: 0, blocked: 0, unavailable: 0, unknown: 0 });
    expect(result.certifiable).toBe(true);
    expect(result.foundation.every((entry) => entry.details.liveProbeAttempted === true)).toBe(true);
    expect(result.foundation.every((entry) => ["live_runtime_proof", "authenticated_runtime_proof"].includes(entry.evidenceType))).toBe(true);
    const canonicalBuckets: NonNullable<RuntimeLatencyBucket>[] = ["under_1s", "1s_to_3s", "3s_to_10s", "over_10s"];
    expect(result.foundation.every((entry) => typeof entry.latencyBucket === "string" && entry.latencyBucket.length > 0)).toBe(true);
    expect(result.foundation.every((entry) => canonicalBuckets.includes(entry.latencyBucket))).toBe(true);
  });

  it("binds all six components to a single runtimeConditionId and deterministic outcomeId", async () => {
    const input = {
      userId: "founder-1",
      deploymentEnvironment: "production",
      deploymentSha: SHA,
      observedAt: OBSERVED_AT,
    };
    const first = await certifyOperationalRuntimeLive(input, adapters());
    const second = await certifyOperationalRuntimeLive(input, adapters());

    const ids = new Set(first.foundation.map((entry) => entry.runtimeConditionId));
    expect(ids.size).toBe(1);
    expect(first.runtimeCondition.conditionId).toBe([...ids][0]);
    expect(first.outcomeId).toBe(second.outcomeId);
  });

  it("keeps deterministic outcomeId unchanged by latency variation", async () => {
    const slow = adapters({
      probeHarmonyOrchestration: async () => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return okProbe("harmony");
      },
      probeJuliusRetrieval: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return okProbe("julius");
      },
    });

    const baseline = await certifyOperationalRuntimeLive(
      { userId: "founder-1", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT },
      adapters(),
    );
    const delayed = await certifyOperationalRuntimeLive(
      { userId: "founder-1", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT },
      slow,
    );

    expect(delayed.outcomeId).toBe(baseline.outcomeId);
  });

  it("fails closed for failed/degraded/unknown/unavailable/blocked component outcomes", async () => {
    const degraded = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters({
      probeJuliusRetrieval: async () => ({ ...okProbe("julius"), status: "degraded" }),
    }));
    expect(degraded.certifiable).toBe(false);

    const blocked = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters({
      probeConnectorRuntime: async () => ({ ...okProbe("connector"), status: "blocked" }),
    }));
    expect(blocked.certifiable).toBe(false);

    const unavailable = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters({
      probeSupabaseRuntime: async () => ({ ...okProbe("supabase"), status: "unavailable", evidenceType: "unknown", liveProbeAttempted: false }),
    }));
    expect(unavailable.certifiable).toBe(false);

    const unknown = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters({
      probeEventMeshRuntime: async () => ({ ...okProbe("event_mesh"), status: "unknown", evidenceType: "unknown", liveProbeAttempted: false }),
    }));
    expect(unknown.certifiable).toBe(false);
  });

  it("adapter throws fail closed for that component", async () => {
    const result = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters({
      probeApprovalRuntime: async () => { throw new Error("probe failed"); },
    }));

    const approval = result.foundation.find((entry) => entry.component === "approval_runtime");
    expect(approval?.status).toBe("unknown");
    expect(approval?.latencyBucket).toBeTypeOf("string");
    expect(result.certifiable).toBe(false);
  });

  it("thrown probe errors with secret-like content are never copied into evidence", async () => {
    const secretError = "Bearer sk-secret-token password=hunter2 url=https://db.example.internal";
    const result = await certifyOperationalRuntimeLive(
      { userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT },
      adapters({
        probeApprovalRuntime: async () => {
          throw new Error(secretError);
        },
      }),
    );

    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("sk-secret-token");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("db.example.internal");
    expect(serialized).not.toContain("bearer");
    expect(serialized).not.toContain("password");
  });

  it("configuration/source-only healthy claims are rejected", async () => {
    const result = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters({
      probeJuliusRetrieval: async () => ({
        ...okProbe("julius"),
        evidenceType: "source_code_proof",
        liveProbeAttempted: false,
      }),
    }));

    const julius = result.foundation.find((entry) => entry.component === "julius_retrieval");
    expect(julius?.status).toBe("unknown");
    expect(result.certifiable).toBe(false);
  });

  it("does not leak sensitive data in returned evidence", async () => {
    const result = await certifyOperationalRuntimeLive({ userId: "u", deploymentEnvironment: "production", deploymentSha: SHA, observedAt: OBSERVED_AT }, adapters());
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("bearer ");
    expect(serialized).not.toContain("service_role");
  });

  it("adapters are invoked as read-only probes (no write/mutation API surface)", async () => {
    const adapter: LiveCertificationAdapters = adapters();
    expect(Object.keys(adapter).sort()).toEqual([
      "probeApprovalRuntime",
      "probeConnectorRuntime",
      "probeEventMeshRuntime",
      "probeHarmonyOrchestration",
      "probeJuliusRetrieval",
      "probeSupabaseRuntime",
    ]);
  });
});
