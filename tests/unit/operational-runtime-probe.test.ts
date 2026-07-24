import { describe, expect, it, vi } from "vitest";
import { certifyOperationalRuntimes } from "@/lib/operational-runtime/probe";
import { resolveRuntimeIdentity } from "@/lib/runtime-identity/resolver";

const observedAt = "2026-07-22T20:00:00.000Z";

function client(options: { workerCount?: number; failTable?: string; userId?: string } = {}) {
  const reads: Array<{ table: string; columns: string; limit: number }> = [];
  const rpcCalls: string[] = [];
  return {
    reads,
    rpcCalls,
    value: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: options.userId ?? "founder-1" } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => ({
        select: (columns: string) => ({
          limit: async (limit: number) => {
            reads.push({ table, columns, limit });
            return options.failTable === table
              ? { data: null, error: { code: "safe_test_error" } }
              : { data: [], error: null };
          },
        }),
      })),
      rpc: vi.fn(async (name: string) => {
        rpcCalls.push(name);
        return {
          data: { pending: 0, leased: 0, retries: 0, deadLetters: 0, workerCount: options.workerCount ?? 1 },
          error: null,
        };
      }),
    },
  };
}

function identity() {
  return resolveRuntimeIdentity({
    AI_PROVIDER: "azure",
    AI_MODEL: "gpt-5.6-sol",
    AZURE_OPENAI_ENDPOINT: "https://aios-harmony-foundry.openai.azure.com",
    AZURE_OPENAI_API_KEY: "must-not-appear",
  }, observedAt);
}

describe("operational runtime live probes", () => {
  it("executes all six bounded read-only probes through the shared evidence contracts", async () => {
    const mock = client();
    const result = await certifyOperationalRuntimes({
      providerIdentity: identity(),
      userId: "founder-1",
      observedAt,
      deploymentEnvironment: "preview",
      deploymentSha: "safe-sha",
      dependencies: {
        createSupabaseClient: async () => mock.value,
        environment: { NODE_ENV: "production", AIOS_EVENT_MESH_PROVIDER: "postgres" },
        clock: (() => {
          let time = 0;
          return () => (time += 10);
        })(),
      },
    });

    expect(result.componentCount).toBe(6);
    expect(result.components.map((item) => item.component)).toEqual([
      "harmony_orchestration",
      "julius_retrieval",
      "connector_runtime",
      "approval_runtime",
      "supabase_runtime",
      "event_mesh_runtime",
    ]);
    expect(result.healthy).toBe(1);
    expect(result.degraded).toBe(5);
    expect(result.blocked).toBe(0);
    expect(result.unavailable).toBe(0);
    expect(result.unknown).toBe(0);
    expect(result.runtimeCondition.logicVersion).toBe("operational-live-probe-v1");
    expect(result.outcomeId).toMatch(/^[a-f0-9]{64}$/);

    expect(mock.reads).toEqual([
      { table: "julius_entries", columns: "id", limit: 0 },
      { table: "approvals", columns: "id", limit: 0 },
      { table: "approval_payloads", columns: "id", limit: 0 },
      { table: "companies", columns: "id", limit: 0 },
    ]);
    expect(mock.rpcCalls).toEqual(["event_mesh_health"]);
    expect(mock.value.auth.getUser).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("must-not-appear");
    expect(JSON.stringify(result)).not.toContain("founder-1");
  });

  it("keeps non-mutating partial probes degraded and capability evidence truthful", async () => {
    const mock = client({ workerCount: 0 });
    const result = await certifyOperationalRuntimes({
      providerIdentity: identity(),
      userId: "founder-1",
      observedAt,
      dependencies: {
        createSupabaseClient: async () => mock.value,
        environment: { NODE_ENV: "production", AIOS_EVENT_MESH_PROVIDER: "postgres" },
      },
    });

    const connector = result.components.find((item) => item.component === "connector_runtime");
    const approval = result.components.find((item) => item.component === "approval_runtime");
    const eventMesh = result.components.find((item) => item.component === "event_mesh_runtime");
    expect(connector).toMatchObject({
      status: "degraded",
      evidenceType: "live_runtime_proof",
      details: { liveProbeAttempted: true },
    });
    expect(connector?.capabilityEvidence).toContainEqual(expect.objectContaining({
      capability: "safe_execution",
      status: "unknown",
      evidenceType: "source_code_proof",
    }));
    expect(approval?.capabilityEvidence).toContainEqual(expect.objectContaining({
      capability: "decision_enforcement",
      status: "unknown",
      evidenceType: "source_code_proof",
    }));
    expect(eventMesh?.capabilityEvidence).toContainEqual(expect.objectContaining({
      capability: "health",
      status: "degraded",
      safeMessage: "event_mesh_worker_heartbeat_missing",
    }));
  });

  it("normalizes database failures without returning backend error details", async () => {
    const mock = client({ failTable: "julius_entries" });
    const result = await certifyOperationalRuntimes({
      providerIdentity: identity(),
      userId: "founder-1",
      observedAt,
      dependencies: {
        createSupabaseClient: async () => mock.value,
        environment: { NODE_ENV: "production", AIOS_EVENT_MESH_PROVIDER: "postgres" },
      },
    });
    const julius = result.components.find((item) => item.component === "julius_retrieval");
    expect(julius).toMatchObject({
      status: "degraded",
      evidenceType: "authenticated_runtime_proof",
      safeErrorCode: "julius_entries_read_unavailable",
      safeMessage: "julius_retrieval_probe_failed",
    });
    expect(JSON.stringify(julius)).not.toContain("safe_test_error");
  });

  it("does not invoke the mutating NATS health path", async () => {
    const mock = client();
    const result = await certifyOperationalRuntimes({
      providerIdentity: identity(),
      userId: "founder-1",
      observedAt,
      dependencies: {
        createSupabaseClient: async () => mock.value,
        environment: { NODE_ENV: "production", AIOS_EVENT_MESH_PROVIDER: "nats" },
      },
    });
    const eventMesh = result.components.find((item) => item.component === "event_mesh_runtime");
    expect(eventMesh).toMatchObject({
      status: "degraded",
      safeErrorCode: "event_mesh_nats_health_is_not_read_only",
    });
    expect(mock.rpcCalls).toEqual([]);
  });

  it("produces the same condition and outcome across Preview and Production under identical runtime conditions", async () => {
    const run = (environment: string, sha: string) => {
      const mock = client();
      return certifyOperationalRuntimes({
        providerIdentity: identity(),
        userId: "founder-1",
        observedAt,
        deploymentEnvironment: environment,
        deploymentSha: sha,
        dependencies: {
          createSupabaseClient: async () => mock.value,
          environment: { NODE_ENV: "production", AIOS_EVENT_MESH_PROVIDER: "postgres" },
        },
      });
    };
    const preview = await run("preview", "preview-sha");
    const production = await run("production", "production-sha");
    expect(preview.runtimeCondition.conditionId).toBe(production.runtimeCondition.conditionId);
    expect(preview.outcomeId).toBe(production.outcomeId);
  });

  it("bounds unavailable service probes and reports timeouts without false health", async () => {
    const never = new Promise<never>(() => undefined);
    const result = await certifyOperationalRuntimes({
      providerIdentity: identity(),
      userId: "founder-1",
      observedAt,
      dependencies: {
        createSupabaseClient: () => never,
        environment: { NODE_ENV: "production", AIOS_EVENT_MESH_PROVIDER: "postgres" },
        timeoutMs: 250,
      },
    });
    expect(result.components.filter((item) => item.status === "unavailable")).toHaveLength(4);
    expect(result.components.filter((item) => item.safeErrorCode === "operational_probe_timeout")).toHaveLength(4);
    expect(result.components.find((item) => item.component === "harmony_orchestration")?.status).toBe("healthy");
  });
});
