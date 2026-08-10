import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.fn();
const currentUserIsAdmin = vi.fn();
const getRuntimeDeploymentIdentity = vi.fn();
const createCertificationResult = vi.fn((input) => ({ id: "cert", ...input }));
const buildStrictValidationEvidence = vi.fn(() => ({ ok: true }));
const redactValidationEvidenceAllowlist = vi.fn((input) => input);
const getOperationalRuntimeFoundation = vi.fn(() => [{ component: "harmony_orchestration" }]);
const getAgentRuntimeMappings = vi.fn(() => [{ agentKey: "harmony", status: "healthy" }]);
const certifyAgentRuntimes = vi.fn(async () => ({
  agentCount: 1,
  healthy: 1,
  degraded: 0,
  blocked: 0,
  unavailable: 0,
  proofStrategy: "provider",
  agentSpecificProbeCount: 0,
  providerProbeCount: 1,
  runtimeCondition: { conditionId: "cond" },
  outcomeId: "outcome",
  mappings: [{ agentKey: "harmony", status: "healthy" }],
}));
const probeRuntimeIdentity = vi.fn(async () => ({ runtimeId: "runtime-probe" }));
const resolveRuntimeIdentity = vi.fn(() => ({ runtimeId: "runtime-static" }));
const resolvePrimaryCompanyId = vi.fn(async () => "company-1");
const certifyOperationalRuntimeLive = vi.fn(async () => ({
  deploymentEnvironment: "production",
  deploymentSha: "a".repeat(40),
  runtimeCondition: { conditionId: "live-cond" },
  outcomeId: "live-outcome",
  summary: {
    componentCount: 6,
    healthy: 6,
    degraded: 0,
    blocked: 0,
    unavailable: 0,
    unknown: 0,
  },
  foundation: [
    { component: "harmony_orchestration" },
    { component: "julius_retrieval" },
    { component: "connector_runtime" },
    { component: "approval_runtime" },
    { component: "supabase_runtime" },
    { component: "event_mesh_runtime" },
  ],
  certifiable: true,
}));

vi.mock("@/lib/auth/user", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/roles", () => ({ currentUserIsAdmin }));
vi.mock("@/lib/deployment/identity", () => ({ getRuntimeDeploymentIdentity }));
vi.mock("@/lib/evidence/certification", () => ({ createCertificationResult }));
vi.mock("@/lib/evidence/validation-evidence", () => ({
  buildStrictValidationEvidence,
  redactValidationEvidenceAllowlist,
}));
vi.mock("@/lib/operational-runtime/certification", () => ({
  getOperationalRuntimeFoundation,
}));
vi.mock("@/lib/operational-runtime/live-certification", () => ({
  certifyOperationalRuntimeLive,
}));
vi.mock("@/lib/runtime-identity/agent-mappings", () => ({ getAgentRuntimeMappings }));
vi.mock("@/lib/runtime-identity/agent-certification", () => ({ certifyAgentRuntimes }));
vi.mock("@/lib/runtime-identity/probe", () => ({ probeRuntimeIdentity }));
vi.mock("@/lib/runtime-identity/resolver", () => ({ resolveRuntimeIdentity }));
vi.mock("@/lib/julius/wiring", () => ({ resolvePrimaryCompanyId }));

const EVIDENCE_TYPES = ["configuration_proof", "authenticated_runtime_proof", "live_runtime_proof"];
vi.mock("@/lib/evidence/model", () => ({ EVIDENCE_TYPES }));
vi.mock("@/lib/workforce/registry", () => ({
  AIOS_WORKFORCE: [{ key: "harmony" }],
  AIOS_WORKFORCE_REGISTRY_VERSION: "v1",
}));

describe("admin certification evidence route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AIOS_DEPLOYMENT_SHA = "a".repeat(40);
    process.env.AIOS_DEPLOYMENT_ENVIRONMENT = "production";
    getRuntimeDeploymentIdentity.mockReturnValue({
      environment: "production",
      commitSha: "a".repeat(40),
    });
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    currentUserIsAdmin.mockResolvedValue(true);
  });

  it("returns 401 when unauthorized", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const res = await GET(new Request("http://localhost/api/admin/certification/evidence"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-Founder", async () => {
    currentUserIsAdmin.mockResolvedValueOnce(false);
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const res = await GET(new Request("http://localhost/api/admin/certification/evidence"));
    expect(res.status).toBe(403);
  });

  it("operational mode invokes live certification and returns six-component result", async () => {
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const res = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=operational"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(certifyOperationalRuntimeLive).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        companyId: "company-1",
        deploymentEnvironment: "production",
        deploymentSha: "a".repeat(40),
      }),
    );
    expect(json.certification.details.operationalProbeRequested).toBe(true);
    expect(json.certification.details.operationalRuntimeLive.summary.componentCount).toBe(6);
    expect(json.certification.details.operationalRuntimeLive.foundation).toHaveLength(6);
  });

  it("operational mode fails closed with 503 for missing/invalid identity", async () => {
    const { GET } = await import("@/app/api/admin/certification/evidence/route");

    delete process.env.AIOS_DEPLOYMENT_SHA;
    let res = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=operational"));
    expect(res.status).toBe(503);

    process.env.AIOS_DEPLOYMENT_SHA = "A".repeat(40);
    process.env.AIOS_DEPLOYMENT_ENVIRONMENT = "production";
    res = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=operational"));
    expect(res.status).toBe(503);

    process.env.AIOS_DEPLOYMENT_SHA = "a".repeat(40);
    process.env.AIOS_DEPLOYMENT_ENVIRONMENT = "staging";
    res = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=operational"));
    expect(res.status).toBe(503);
  });

  it("operational mode fails closed when company id is missing", async () => {
    resolvePrimaryCompanyId.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    const res = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=operational"));
    expect(res.status).toBe(503);
    expect(certifyOperationalRuntimeLive).not.toHaveBeenCalled();
  });

  it("request inputs cannot override operational deployment identity", async () => {
    const { GET } = await import("@/app/api/admin/certification/evidence/route");
    await GET(new Request("http://localhost/api/admin/certification/evidence?probe=operational&deploymentSha=b" + "b".repeat(39)));

    expect(certifyOperationalRuntimeLive).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentEnvironment: "production",
        deploymentSha: "a".repeat(40),
      }),
    );
  });

  it("preserves existing probe modes", async () => {
    const { GET } = await import("@/app/api/admin/certification/evidence/route");

    const probeRes = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=1"));
    expect(probeRuntimeIdentity).toHaveBeenCalledTimes(1);
    expect(certifyAgentRuntimes).not.toHaveBeenCalled();
    expect(certifyOperationalRuntimeLive).not.toHaveBeenCalled();

    const workforceRes = await GET(new Request("http://localhost/api/admin/certification/evidence?probe=workforce"));
    expect(certifyAgentRuntimes).toHaveBeenCalledTimes(1);

    const normalRes = await GET(new Request("http://localhost/api/admin/certification/evidence"));
    const normalJson = await normalRes.json();
    expect(normalJson.certification.details.operationalRuntimeFoundation).toEqual([{ component: "harmony_orchestration" }]);

    expect(probeRes.status).toBe(200);
    expect(workforceRes.status).toBe(200);
    expect(normalRes.status).toBe(200);
  });
});
