import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_RUNTIME_PROBE_SYSTEMS,
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

describe("AIOS per-agent live runtime certification", () => {
  it("runs one fixed non-writing probe per canonical agent with bounded concurrency", async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return successResponse();
    }) as typeof fetch;

    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      concurrency: 2,
      providerIdentity: resolveRuntimeIdentity(environment, observedAt),
      probe: (options) => probeRuntimeIdentity({ ...options, fetchImpl }),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(2);
    expect(result).toMatchObject({
      requested: true,
      agentCount: 10,
      healthy: 10,
      degraded: 0,
      blocked: 0,
      unavailable: 0,
    });
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
        deploymentIdentity: {
          provider: "azure",
          model: "gpt-5.6-sol",
          deploymentName: "gpt-5.6-sol",
          endpointHostname: "aios-harmony-foundry.openai.azure.com",
          sharedOrDedicated: "shared",
        },
        details: {
          modelRuntimeEvidenceType: "authenticated_runtime_proof",
          deterministicEvidenceType: "source_code_proof",
          dedicatedDeploymentVerified: false,
          agentProbeAttempted: true,
        },
      });
      expect(mapping.observedBy).toBe(`runtime_identity.agent_probe.${mapping.agentKey}`);
      expect(mapping.deterministicCapabilities.length).toBeGreaterThan(0);
      expect(mapping.modelBackedCapabilities.length).toBeGreaterThan(0);
      expect(mapping.approvalRequirements).toHaveLength(1);
      expect(mapping.unsupportedCapabilities.length).toBeGreaterThan(0);
      expect(mapping.safetyBoundaries.length).toBeGreaterThanOrEqual(3);
    }

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("agent-probe-test-secret");
    expect(serialized).not.toContain("DO_NOT_RETURN");
    expect(serialized).not.toContain("Reply only OK");
  });

  it("blocks only the failed shared-model capabilities and preserves deterministic distinctions", async () => {
    const providerIdentity = resolveRuntimeIdentity(environment, observedAt);
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity,
      probe: (options) => probeRuntimeIdentity({
        ...options,
        fetchImpl: vi.fn(async () =>
          options.fixedProbe?.observedBy.endsWith(".harmony")
            ? new Response("hidden failure", { status: 503 })
            : successResponse()) as typeof fetch,
        maxAttempts: 1,
      }),
    });

    const harmony = result.mappings.find((mapping) => mapping.agentKey === "harmony");
    const auditor = result.mappings.find((mapping) => mapping.agentKey === "auditor");
    expect(harmony).toMatchObject({
      status: "blocked",
      primaryExecution: "shared_provider",
      modelRuntimeStatus: "failed",
      evidenceType: "authenticated_runtime_proof",
      blockedCapabilities: ["operator_conversation", "agent_conversation"],
    });
    expect(auditor).toMatchObject({
      status: "healthy",
      primaryExecution: "deterministic",
      modelRuntimeStatus: "healthy",
    });
    expect(harmony?.deterministicCapabilities).toContain("task_routing");
    expect(JSON.stringify(result)).not.toContain("hidden failure");
  });

  it("reports missing configuration without attempting or fabricating live evidence", async () => {
    const missing = { AI_PROVIDER: "azure" };
    const probe = vi.fn((options) => probeRuntimeIdentity(options));
    const result = await certifyAgentRuntimes({
      environment: missing,
      observedAt,
      providerIdentity: resolveRuntimeIdentity(missing, observedAt),
      probe,
    });

    expect(probe).toHaveBeenCalledTimes(10);
    expect(result.healthy).toBe(0);
    expect(result.mappings.every((mapping) => mapping.evidenceType === "source_code_proof")).toBe(true);
    expect(result.mappings.every((mapping) => mapping.modelRuntimeStatus === "configuration_missing")).toBe(true);
    expect(result.mappings.every((mapping) => mapping.details.agentProbeAttempted === false)).toBe(true);
    expect(result.mappings.filter((mapping) => mapping.primaryExecution === "shared_provider").every(
      (mapping) => mapping.status === "blocked",
    )).toBe(true);
  });

  it("distinguishes unavailable runtimes from missing configuration", async () => {
    const unavailable = { AI_PROVIDER: "unsupported-provider" };
    const result = await certifyAgentRuntimes({
      environment: unavailable,
      observedAt,
      providerIdentity: resolveRuntimeIdentity(unavailable, observedAt),
    });
    const harmony = result.mappings.find((mapping) => mapping.agentKey === "harmony");
    const mason = result.mappings.find((mapping) => mapping.agentKey === "mason");
    expect(harmony).toMatchObject({
      status: "unavailable",
      modelRuntimeStatus: "runtime_unavailable",
    });
    expect(mason).toMatchObject({
      status: "degraded",
      modelRuntimeStatus: "runtime_unavailable",
      primaryExecution: "deterministic",
    });
  });

  it("keeps Mason hybrid/deterministic and external Foundry identities separate", async () => {
    const result = await certifyAgentRuntimes({
      environment,
      observedAt,
      providerIdentity: resolveRuntimeIdentity(environment, observedAt),
      probe: (options) => probeRuntimeIdentity({
        ...options,
        fetchImpl: vi.fn(async () => successResponse()) as typeof fetch,
      }),
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

  it("covers exactly the canonical workforce and excludes Julius, templates, and reserved names", () => {
    expect(Object.keys(AGENT_RUNTIME_PROBE_SYSTEMS)).toEqual(
      AIOS_WORKFORCE.map((agent) => agent.key),
    );
    expect(Object.keys(AGENT_RUNTIME_PROBE_SYSTEMS)).not.toContain(JULIUS.name.toLowerCase());
    for (const reserved of ["Nexus", "Sentinel", "Guardian", "Oracle", "Compass"]) {
      expect(isReservedAirbidName(reserved)).toBe(true);
      expect(Object.keys(AGENT_RUNTIME_PROBE_SYSTEMS)).not.toContain(reserved.toLowerCase());
    }
  });

  it("contains no persistence, approval creation, tool execution, or user prompt path", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/runtime-identity/agent-certification.ts"),
      "utf8",
    );
    for (const forbidden of [
      "createAdminClient",
      "admin.from(",
      "supabase.from(",
      "createApproval",
      "runConnectorCapability",
      "executeMason",
      "request.nextUrl.searchParams.get(\"prompt\")",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
