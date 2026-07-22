import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  admin: false,
}));

const runtimeProbe = vi.hoisted(() => vi.fn());
const agentCertification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/user", () => ({
  getCurrentUser: vi.fn(async () => authState.user),
}));

vi.mock("@/lib/auth/roles", () => ({
  currentUserIsAdmin: vi.fn(async () => authState.admin),
}));

vi.mock("@/lib/runtime-identity/probe", () => ({
  probeRuntimeIdentity: runtimeProbe,
}));

vi.mock("@/lib/runtime-identity/agent-certification", () => ({
  certifyAgentRuntimes: agentCertification,
}));

describe("Founder Evidence Layer certification endpoint", () => {
  beforeEach(() => {
    authState.user = null;
    authState.admin = false;
    process.env.VERCEL_GIT_COMMIT_SHA = "safe-commit-sha";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_safe";
    process.env.AI_PROVIDER = "openai";
    process.env.AI_MODEL = "gpt-safe";
    process.env.OPENAI_API_KEY = "endpoint-test-secret";
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_API_KEY;
    runtimeProbe.mockReset();
    agentCertification.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects authenticated non-Founder requests", async () => {
    authState.user = { id: "subscriber-1" };
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
  });

  it("returns only canonical safe evidence metadata to a Founder", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.certification).toMatchObject({
      status: "healthy",
      evidenceType: "authenticated_runtime_proof",
      observedBy: "api.admin.certification.evidence",
      confidence: 1,
      details: {
        scope: "evidence_layer",
        schemaVersion: "1.3.0",
        deployment: {
          commitSha: "safe-commit-sha",
          environment: "production",
          vercelDeploymentId: "dpl_safe",
        },
        workforceRegistry: { version: "2.1", agentCount: 10 },
        runtimeIdentity: {
          status: "degraded",
          runtimeType: "openai",
          provider: "openai",
          model: "gpt-safe",
          endpointHostname: "api.openai.com",
          configurationStatus: "complete",
          inferenceStatus: "not_probed",
          evidenceType: "configuration_proof",
        },
        inferenceProbeRequested: false,
        workforceProbeRequested: false,
      },
    });
    expect(body.certification.details.supportedEvidenceTypes).toHaveLength(6);
    expect(body.certification.details.workforceRegistry.agentKeys).toContain("harmony");
    expect(body.certification.details.agentRuntimeMappings).toHaveLength(10);
    expect(body.certification.details.agentRuntimeMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentKey: "mason",
        primaryExecution: "deterministic",
        evidenceType: "source_code_proof",
      }),
    ]));
    expect(runtimeProbe).not.toHaveBeenCalled();
    expect(agentCertification).not.toHaveBeenCalled();

    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["access_token", "authorization", "cookie", "credential", "prompt_content", "memory_contents", "customer_data", "endpoint-test-secret"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("founder-1");
  });

  it("returns allowlisted Azure configuration identity without implying live proof", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;
    process.env.AI_PROVIDER = "azure";
    process.env.AI_MODEL = "gpt-5.6-sol";
    process.env.AZURE_OPENAI_ENDPOINT = "https://aios-harmony.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "azure-endpoint-test-secret";

    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.certification.details.runtimeIdentity).toMatchObject({
      status: "degraded",
      provider: "azure",
      model: "gpt-5.6-sol",
      deploymentName: "gpt-5.6-sol",
      endpointHostname: "aios-harmony.openai.azure.com",
      configurationStatus: "complete",
      inferenceStatus: "not_probed",
      evidenceType: "configuration_proof",
      details: { authenticationConfigured: true },
    });
    expect(body.certification.details.agentRuntimeMappings).toHaveLength(10);
    expect(body.certification.details.agentRuntimeMappings.every(
      (mapping: { sharedProviderRuntimeId: string | null }) =>
        mapping.sharedProviderRuntimeId === "aios.runtime.shared.azure",
    )).toBe(true);
    expect(JSON.stringify(body)).not.toContain("azure-endpoint-test-secret");
  });

  it("runs the non-writing inference probe only when a Founder explicitly requests it", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;
    runtimeProbe.mockResolvedValue({
      status: "healthy",
      runtimeId: "aios.runtime.shared.openai",
      runtimeType: "openai",
      provider: "openai",
      model: "gpt-safe",
      deploymentName: null,
      modelVersion: null,
      endpointHostname: "api.openai.com",
      sharedOrDedicated: "shared",
      configurationStatus: "complete",
      inferenceStatus: "healthy",
      latencyBucket: "under_1s",
      safeErrorCode: null,
      safeMessage: "provider_inference_probe_succeeded",
      evidenceType: "authenticated_runtime_proof",
      observedAt: "2026-07-22T12:00:00.000Z",
      observedBy: "runtime_identity.inference_probe",
      confidence: 0.95,
      details: {
        scope: "provider_runtime_identity",
        providerExplicit: true,
        modelSource: "explicit",
        authenticationConfigured: true,
        endpointConfigured: true,
        inferenceAttempted: true,
      },
    });

    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET(new Request("https://aios.example/api/admin/certification/evidence?probe=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runtimeProbe).toHaveBeenCalledTimes(1);
    expect(agentCertification).not.toHaveBeenCalled();
    expect(body.certification.details.inferenceProbeRequested).toBe(true);
    expect(body.certification.details.runtimeIdentity).toMatchObject({
      status: "healthy",
      inferenceStatus: "healthy",
      evidenceType: "authenticated_runtime_proof",
    });
    expect(JSON.stringify(body)).not.toContain("endpoint-test-secret");
  });

  it("runs all fixed workforce probes only when explicitly requested", async () => {
    authState.user = { id: "founder-1" };
    authState.admin = true;
    const providerProof = {
      status: "healthy",
      runtimeId: "aios.runtime.shared.azure",
      runtimeType: "azure_openai",
      provider: "azure",
      model: "gpt-5.6-sol",
      deploymentName: "gpt-5.6-sol",
      modelVersion: null,
      endpointHostname: "aios-harmony.openai.azure.com",
      sharedOrDedicated: "shared",
      configurationStatus: "complete",
      inferenceStatus: "healthy",
      latencyBucket: "under_1s",
      safeErrorCode: null,
      safeMessage: "provider_inference_probe_succeeded",
      evidenceType: "authenticated_runtime_proof",
      observedAt: "2026-07-22T12:00:00.000Z",
      observedBy: "runtime_identity.inference_probe",
      confidence: 0.95,
      details: {
        scope: "provider_runtime_identity",
        providerExplicit: true,
        modelSource: "deployment",
        authenticationConfigured: true,
        endpointConfigured: true,
        inferenceAttempted: true,
      },
    };
    const mappings = Array.from({ length: 10 }, (_, index) => ({
      agentKey: `agent-${index}`,
      status: "healthy",
      evidenceType: "authenticated_runtime_proof",
      observedAt: "2026-07-22T12:00:00.000Z",
      observedBy: `runtime_identity.agent_probe.agent-${index}`,
      confidence: 0.95,
      details: { scope: "agent_runtime_mapping", agentProbeAttempted: true },
    }));
    runtimeProbe.mockResolvedValue(providerProof);
    agentCertification.mockResolvedValue({
      requested: true,
      agentCount: 10,
      healthy: 10,
      degraded: 0,
      blocked: 0,
      unavailable: 0,
      mappings,
    });

    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const response = await GET(new Request(
      "https://aios.example/api/admin/certification/evidence?probe=workforce&prompt=ignored",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(runtimeProbe).toHaveBeenCalledTimes(1);
    expect(agentCertification).toHaveBeenCalledTimes(1);
    expect(agentCertification).toHaveBeenCalledWith(expect.objectContaining({
      providerIdentity: providerProof,
    }));
    expect(agentCertification.mock.calls[0][0]).not.toHaveProperty("prompt");
    expect(body.certification.details).toMatchObject({
      inferenceProbeRequested: true,
      workforceProbeRequested: true,
      workforceRuntimeSummary: {
        agentCount: 10,
        healthy: 10,
        degraded: 0,
        blocked: 0,
        unavailable: 0,
      },
      agentRuntimeMappings: mappings,
    });
    expect(JSON.stringify(body)).not.toContain("ignored");
  });
});
