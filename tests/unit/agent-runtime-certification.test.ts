import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  compareRuntimeCertificationSnapshots,
} from "@/lib/operational-runtime/certification";
import {
  WORKFORCE_RUNTIME_CERTIFICATION_VERSION,
  certifyAgentRuntimes,
} from "@/lib/runtime-identity/agent-certification";
import { probeRuntimeIdentity } from "@/lib/runtime-identity/probe";
import { resolveRuntimeIdentity } from "@/lib/runtime-identity/resolver";
import {
  AIOS_WORKFORCE,
  JULIUS,
  isReservedAirbidName,
} from "@/lib/workforce/registry";

const observedAt = "2026-07-22T16:00:00.000Z";
const environment = {
  AI_PROVIDER: "azure",
  AI_MODEL: "gpt-5.6-sol",
  AZURE_OPENAI_ENDPOINT: "https://aios-harmony-foundry.openai.azure.com",
  AZURE_OPENAI_API_KEY: "agent-probe-test-secret",
};

function successResponse() {
  return new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: "DO_NOT_RETURN" }] }],
  }), { status: 200 });
}

async function healthyProviderProof() {
  return probeRuntimeIdentity({
    environment,
    observedAt,
    fetchImpl: vi.fn(async () => successResponse()) as typeof fetch,
  });
}

describe("AIOS per-agent live runtime certification", () => {
  it("binds all canonical agents to one supplied authenticated runtime observation", async () => {
    const providerIdentity = await healthyProviderProof();
    const probe = vi.fn();
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity,
      probe,
      deploymentEnvironment: "preview",
      deploymentSha: "preview-sha",
    });

    expect(probe).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      requested: true,
      agentCount: 10,
      healthy: 10,
      degraded: 0,
      blocked: 0,
      unavailable: 0,
      proofStrategy: "shared_runtime_snapshot",
      agentSpecificProbeCount: 0,
      providerProbeCount: 0,
      runtimeCondition: {
        logicVersion: WORKFORCE_RUNTIME_CERTIFICATION_VERSION,
        provider: "azure",
        model: "gpt-5.6-sol",
        deploymentName: "gpt-5.6-sol",
        endpointHostname: "aios-harmony-foundry.openai.azure.com",
        deploymentEnvironment: "preview",
        deploymentSha: "preview-sha",
      },
    });
    expect(result.runtimeCondition.conditionId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.outcomeId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.mappings.map((mapping) => mapping.agentKey)).toEqual(
      AIOS_WORKFORCE.map((agent) => agent.key),
    );
    for (const mapping of result.mappings) {
      expect(mapping).toMatchObject({
        status: "healthy",
        evidenceType: "authenticated_runtime_proof",
        confidence: 0.95,
        modelRuntimeStatus: "healthy",
        sharedProviderRuntimeId: "aios.runtime.shared.azure",
        blockedCapabilities: [],
        unverifiedCapabilities: [],
        safeErrorCode: null,
        safeMessage: "agent_shared_model_runtime_binding_succeeded",
        details: {
          modelRuntimeEvidenceType: "authenticated_runtime_proof",
          deterministicEvidenceType: "source_code_proof",
          dedicatedDeploymentVerified: false,
          agentProbeAttempted: false,
          sharedRuntimeProofApplied: true,
          proofStrategy: "shared_runtime_snapshot",
          runtimeConditionId: result.runtimeCondition.conditionId,
        },
      });
      expect(mapping.observedBy).toBe(
        `runtime_identity.shared_runtime_binding.${mapping.agentKey}`,
      );
      expect(mapping.deterministicCapabilities.length).toBeGreaterThan(0);
      expect(mapping.modelBackedCapabilities.length).toBeGreaterThan(0);
      expect(mapping.approvalRequirements).toHaveLength(1);
      expect(mapping.unsupportedCapabilities.length).toBeGreaterThan(0);
      expect(mapping.safetyBoundaries).toContain(
        "Deterministic capabilities remain source-code proof until separately live-probed.",
      );
    }

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("agent-probe-test-secret");
    expect(serialized).not.toContain("DO_NOT_RETURN");
  });

  it("runs exactly one bounded provider probe when no proof is supplied", async () => {
    const providerIdentity = await healthyProviderProof();
    const probe = vi.fn(async () => providerIdentity);
    const result = await certifyAgentRuntimes({ environment, observedAt, probe });

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(expect.objectContaining({
      environment,
      observedAt,
      maxAttempts: 2,
      timeoutMs: 5_000,
    }));
    expect(result).toMatchObject({
      healthy: 10,
      providerProbeCount: 1,
      agentSpecificProbeCount: 0,
    });
  });

  it("makes Preview and Production deterministic for identical safe runtime conditions", async () => {
    const providerIdentity = await healthyProviderProof();
    const preview = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity,
      deploymentEnvironment: "preview",
      deploymentSha: "pr-head",
    });
    const production = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity,
      deploymentEnvironment: "production",
      deploymentSha: "squash-merge",
    });

    expect(preview.runtimeCondition.conditionId).toBe(
      production.runtimeCondition.conditionId,
    );
    expect(preview.outcomeId).toBe(production.outcomeId);
    expect(compareRuntimeCertificationSnapshots(
      {
        conditionId: preview.runtimeCondition.conditionId,
        outcomeId: preview.outcomeId,
      },
      {
        conditionId: production.runtimeCondition.conditionId,
        outcomeId: production.outcomeId,
      },
    )).toMatchObject({ status: "consistent", conditionMatches: true, outcomeMatches: true });
    expect(preview.mappings.map(({ agentKey, status, safeErrorCode }) => ({
      agentKey,
      status,
      safeErrorCode,
    }))).toEqual(production.mappings.map(({ agentKey, status, safeErrorCode }) => ({
      agentKey,
      status,
      safeErrorCode,
    })));
    expect(preview.runtimeCondition.deploymentEnvironment).toBe("preview");
    expect(production.runtimeCondition.deploymentEnvironment).toBe("production");
  });

  it("propagates one observed provider failure and normalized code consistently", async () => {
    const providerIdentity = await probeRuntimeIdentity({
      environment,
      observedAt,
      fetchImpl: vi.fn(async () => new Response("hidden", { status: 503 })) as typeof fetch,
      maxAttempts: 1,
    });
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity,
    });

    expect(result.healthy).toBe(0);
    expect(result.mappings.every(
      (mapping) => mapping.safeErrorCode === "provider_unavailable",
    )).toBe(true);
    expect(result.mappings.filter(
      (mapping) => mapping.primaryExecution === "shared_provider",
    ).every((mapping) => mapping.status === "blocked")).toBe(true);
    expect(result.mappings.filter(
      (mapping) => mapping.primaryExecution === "deterministic",
    ).every((mapping) => mapping.status === "degraded")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  it("fails closed when supplied proof does not match current configuration", async () => {
    const openAiEnvironment = {
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-safe",
      OPENAI_API_KEY: "other-secret",
    };
    const mismatchedProof = await probeRuntimeIdentity({
      environment: openAiEnvironment,
      observedAt,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
      }), { status: 200 })) as typeof fetch,
    });
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity: mismatchedProof,
    });

    expect(result.healthy).toBe(0);
    expect(result.mappings.every(
      (mapping) => mapping.safeErrorCode === "runtime_configuration_identity_mismatch",
    )).toBe(true);
  });

  it("reports missing configuration without attempting or fabricating live evidence", async () => {
    const missing = { AI_PROVIDER: "azure" };
    const result = await certifyAgentRuntimes({
      environment: missing,
      observedAt,
      providerIdentity: resolveRuntimeIdentity(missing, observedAt),
    });

    expect(result.healthy).toBe(0);
    expect(result.mappings.every(
      (mapping) => mapping.evidenceType === "source_code_proof",
    )).toBe(true);
    expect(result.mappings.every(
      (mapping) => mapping.modelRuntimeStatus === "configuration_missing",
    )).toBe(true);
    expect(result.mappings.every(
      (mapping) => mapping.details.agentProbeAttempted === false,
    )).toBe(true);
  });

  it("keeps Mason deterministic and external Foundry identities separate", async () => {
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity: await healthyProviderProof(),
    });
    const mason = result.mappings.find((mapping) => mapping.agentKey === "mason");
    expect(mason).toMatchObject({
      status: "healthy",
      runtimeMode: "hybrid_shared_deterministic_runtime",
      primaryExecution: "deterministic",
      deterministicRuntimeId: "aios.runtime.deterministic.mason",
      sharedProviderRuntimeId: "aios.runtime.shared.azure",
      externalRuntimeStatus: "externally_configured_unverified",
    });
    expect(mason?.approvalRequirements.join(" ")).toContain("Founder-only");
    expect(mason?.unsupportedCapabilities).toContain("Unapproved merge");
  });

  it("covers exactly the canonical workforce and excludes Julius and reserved names", async () => {
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity: await healthyProviderProof(),
    });
    const keys = result.mappings.map((mapping) => mapping.agentKey);
    expect(keys).toEqual(AIOS_WORKFORCE.map((agent) => agent.key));
    expect(keys).not.toContain(JULIUS.name.toLowerCase());
    for (const reserved of ["Nexus", "Sentinel", "Guardian", "Oracle", "Compass"]) {
      expect(isReservedAirbidName(reserved)).toBe(true);
      expect(keys).not.toContain(reserved.toLowerCase());
    }
  });

  it("contains no per-agent model loop, persistence, approval, or tool execution", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/runtime-identity/agent-certification.ts"),
      "utf8",
    );
    for (const forbidden of [
      "mapWithConcurrency",
      "fixedProbe",
      "AGENT_RUNTIME_PROBE_SYSTEMS",
      "createAdminClient",
      "admin.from(",
      "supabase.from(",
      "createApproval",
      "runConnectorCapability",
      "executeMason",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
