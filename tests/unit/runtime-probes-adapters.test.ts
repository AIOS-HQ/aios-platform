import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProbeScope } from "@/lib/runtime/probes/types";

vi.mock("@/lib/harmony/code/mason-production-runtime", () => ({ masonRuntimeHealth: vi.fn() }));
vi.mock("@/lib/integrations/connector-health", () => ({ getConnectorHealth: vi.fn() }));
vi.mock("@/lib/integrations/clients/production-readiness", () => ({ runProductionReadiness: vi.fn() }));
vi.mock("@/lib/data/os/activity", () => ({ listActivity: vi.fn() }));
vi.mock("@/lib/harmony/collaboration", () => ({ loadHarmonyActivity: vi.fn() }));

const scope: ProbeScope = { userId: "user-1", companyId: "company-1" };

describe("runtime probe adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps runtime execution health to healthy/failed deterministically", async () => {
    const { masonRuntimeHealth } = await import("@/lib/harmony/code/mason-production-runtime");
    vi.mocked(masonRuntimeHealth).mockResolvedValueOnce({ github: true, vercel: true, harmony: true });
    const { runtimeExecutionProbe } = await import("@/lib/runtime/probes/adapters/runtime-execution");
    const healthy = await runtimeExecutionProbe(scope);
    expect(healthy.category).toBe("execution_health");
    expect(healthy.source).toBe("runtime_execution");
    expect(healthy.status).toBe("healthy");
    expect(healthy.unavailable).toBe(false);

    vi.mocked(masonRuntimeHealth).mockResolvedValueOnce({ github: true, vercel: false, harmony: false });
    const failed = await runtimeExecutionProbe(scope);
    expect(failed.status).toBe("failed");
    expect(failed.reason).toContain("Required runtime dependencies");
  });

  it("maps connector health states to unknown/degraded/failed/healthy", async () => {
    const { getConnectorHealth } = await import("@/lib/integrations/connector-health");
    const { connectorHealthProbe } = await import("@/lib/runtime/probes/adapters/connector-health");

    vi.mocked(getConnectorHealth).mockResolvedValueOnce([]);
    const unavailable = await connectorHealthProbe(scope);
    expect(unavailable.status).toBe("unknown");
    expect(unavailable.unavailable).toBe(true);
    expect(unavailable.observedAt).toBeNull();
    expect(unavailable.freshness).toBe("unknown");

    vi.mocked(getConnectorHealth).mockResolvedValueOnce([
      { provider: "github", name: "GitHub", status: "connected", state: "plaintext_token", tokenEncryption: "plaintext", hasRefreshToken: true, refreshable: true, expiresAt: null, isExpired: false, lastRefresh: null, connectedAt: null, recommendedAction: "x" },
    ] as never);
    const degraded = await connectorHealthProbe(scope);
    expect(degraded.status).toBe("degraded");

    vi.mocked(getConnectorHealth).mockResolvedValueOnce([
      { provider: "github", name: "GitHub", status: "expired", state: "needs_reauth", tokenEncryption: "encrypted", hasRefreshToken: false, refreshable: false, expiresAt: null, isExpired: true, lastRefresh: null, connectedAt: null, recommendedAction: "x" },
    ] as never);
    const failed = await connectorHealthProbe(scope);
    expect(failed.status).toBe("failed");

    vi.mocked(getConnectorHealth).mockResolvedValueOnce([
      { provider: "github", name: "GitHub", status: "connected", state: "healthy", tokenEncryption: "encrypted", hasRefreshToken: true, refreshable: true, expiresAt: null, isExpired: false, lastRefresh: null, connectedAt: null, recommendedAction: "x" },
    ] as never);
    const healthy = await connectorHealthProbe(scope);
    expect(healthy.status).toBe("healthy");
  });

  it("maps diagnostics readiness status parity", async () => {
    const { runProductionReadiness } = await import("@/lib/integrations/clients/production-readiness");
    const { diagnosticsProbe } = await import("@/lib/runtime/probes/adapters/diagnostics");

    vi.mocked(runProductionReadiness).mockResolvedValueOnce({ status: "ok", sections: [] } as never);
    const ok = await diagnosticsProbe(scope);
    expect(ok.category).toBe("readiness");
    expect(ok.status).toBe("healthy");

    vi.mocked(runProductionReadiness).mockResolvedValueOnce({ status: "warn", sections: [{ id: "env", title: "Env", status: "warn", items: [] }] } as never);
    const warn = await diagnosticsProbe(scope);
    expect(warn.status).toBe("degraded");
    expect(warn.evidence[0]?.ref).toContain("readiness:env:warn");
  });

  it("maps activity to unavailable or healthy with deterministic summary", async () => {
    const { listActivity } = await import("@/lib/data/os/activity");
    const { activityProbe } = await import("@/lib/runtime/probes/adapters/activity");

    vi.mocked(listActivity).mockResolvedValueOnce([]);
    const empty = await activityProbe(scope);
    expect(empty.status).toBe("unknown");
    expect(empty.unavailable).toBe(true);

    vi.mocked(listActivity).mockResolvedValueOnce([
      { id: "evt-1", created_at: "2026-07-29T00:00:00.000Z" },
      { id: "evt-2", created_at: "2026-07-28T00:00:00.000Z" },
    ] as never);
    const populated = await activityProbe(scope);
    expect(populated.status).toBe("healthy");
    expect(populated.summary).toContain("2 recent events");
    expect(populated.observedAt).toBe("2026-07-29T00:00:00.000Z");
  });

  it("maps workforce message signals to liveness parity", async () => {
    const { loadHarmonyActivity } = await import("@/lib/harmony/collaboration");
    const { workforceSignalsProbe } = await import("@/lib/runtime/probes/adapters/workforce");

    vi.mocked(loadHarmonyActivity).mockResolvedValueOnce([]);
    const none = await workforceSignalsProbe(scope);
    expect(none.category).toBe("liveness");
    expect(none.status).toBe("unknown");
    expect(none.unavailable).toBe(true);

    vi.mocked(loadHarmonyActivity).mockResolvedValueOnce([
      { id: "msg-1", at: "2026-07-29T03:00:00.000Z" },
      { id: "msg-2", at: "2026-07-28T03:00:00.000Z" },
    ] as never);
    const live = await workforceSignalsProbe(scope);
    expect(live.status).toBe("healthy");
    expect(live.summary).toContain("2 recent messages");
    expect(live.observedAt).toBe("2026-07-29T03:00:00.000Z");
  });
});
