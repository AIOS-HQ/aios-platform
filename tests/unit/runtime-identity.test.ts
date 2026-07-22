import { describe, expect, it, vi } from "vitest";
import {
  RUNTIME_TYPES,
} from "@/lib/runtime-identity/model";
import {
  resolveRuntimeIdentity,
  safeEndpointHostname,
} from "@/lib/runtime-identity/resolver";
import { probeRuntimeIdentity } from "@/lib/runtime-identity/probe";
import {
  getAgentRuntimeMappings,
  hasCompleteCanonicalRuntimeMappings,
} from "@/lib/runtime-identity/agent-mappings";
import {
  AIOS_WORKFORCE,
  JULIUS,
  isReservedAirbidName,
} from "@/lib/workforce/registry";

const observedAt = "2026-07-22T12:00:00.000Z";

describe("canonical provider runtime identity", () => {
  it("exposes the supported runtime identity vocabulary", () => {
    expect(RUNTIME_TYPES).toEqual([
      "azure_foundry",
      "azure_openai",
      "openai",
      "shared_provider",
      "deterministic",
      "unsupported",
      "unavailable",
    ]);
  });

  it("reports explicit OpenAI configuration without overstating inference", () => {
    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-safe",
      OPENAI_API_KEY: "never-return-this-key",
    }, observedAt);

    expect(identity).toMatchObject({
      status: "degraded",
      runtimeId: "aios.runtime.shared.openai",
      runtimeType: "openai",
      provider: "openai",
      model: "gpt-safe",
      endpointHostname: "api.openai.com",
      sharedOrDedicated: "shared",
      configurationStatus: "complete",
      inferenceStatus: "not_probed",
      evidenceType: "configuration_proof",
      observedAt,
    });
    expect(JSON.stringify(identity)).not.toContain("never-return-this-key");
  });

  it("keeps an implicit fallback model visible but configuration incomplete", () => {
    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "configured",
    }, observedAt);

    expect(identity.model).toBe("gpt-4o-mini");
    expect(identity.configurationStatus).toBe("incomplete");
    expect(identity.details.modelSource).toBe("source_fallback");
    expect(identity.evidenceType).toBe("configuration_proof");
    expect(identity.inferenceStatus).toBe("not_probed");
  });

  it("labels Anthropic as the same shared provider runtime class", () => {
    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "anthropic",
      AI_MODEL: "claude-safe",
      ANTHROPIC_API_KEY: "configured",
    }, observedAt);

    expect(identity).toMatchObject({
      runtimeType: "shared_provider",
      provider: "anthropic",
      model: "claude-safe",
      endpointHostname: "api.anthropic.com",
      sharedOrDedicated: "shared",
      configurationStatus: "complete",
      inferenceStatus: "not_probed",
      evidenceType: "configuration_proof",
    });
  });

  it("rejects malformed model identifiers without returning the malformed value", () => {
    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "openai",
      AI_MODEL: "https://user:secret@example.invalid/model?token=private",
      OPENAI_API_KEY: "configured",
    }, observedAt);

    expect(identity.model).toBeNull();
    expect(identity.configurationStatus).toBe("misconfigured");
    expect(identity.safeMessage).toBe("provider_model_identifier_invalid");
    expect(JSON.stringify(identity)).not.toContain("example.invalid");
  });

  it("reports a missing provider as unavailable instead of applying the source fallback", () => {
    const identity = resolveRuntimeIdentity({ OPENAI_API_KEY: "configured" }, observedAt);

    expect(identity).toMatchObject({
      status: "unavailable",
      runtimeType: "unavailable",
      provider: null,
      model: null,
      configurationStatus: "unavailable",
      evidenceType: "configuration_proof",
      safeMessage: "ai_provider_not_explicitly_configured",
    });
  });

  it("labels explicit mock configuration as deterministic", () => {
    expect(resolveRuntimeIdentity({ AI_PROVIDER: "mock" }, observedAt)).toMatchObject({
      status: "healthy",
      runtimeType: "deterministic",
      provider: "mock",
      model: null,
      sharedOrDedicated: "deterministic",
      configurationStatus: "complete",
      inferenceStatus: "not_applicable",
      evidenceType: "configuration_proof",
    });
  });

  it("reports unsupported providers without echoing the configured value", () => {
    const identity = resolveRuntimeIdentity({ AI_PROVIDER: "secret-provider-value" }, observedAt);

    expect(identity.provider).toBe("unknown");
    expect(identity.runtimeType).toBe("unsupported");
    expect(identity.configurationStatus).toBe("unsupported");
    expect(JSON.stringify(identity)).not.toContain("secret-provider-value");
  });

  it("normalizes endpoint hostnames and never returns URL credentials or queries", () => {
    expect(safeEndpointHostname("https://user:secret@safe.example.com/path?sig=private")).toBe("safe.example.com");
    expect(safeEndpointHostname("not a URL")).toBeNull();

    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "azure_openai",
      AI_MODEL: "gpt-safe",
      AZURE_OPENAI_ENDPOINT: "https://user:secret@safe.openai.azure.com/path?sig=private",
      AZURE_OPENAI_DEPLOYMENT: "deployment-safe",
      AZURE_OPENAI_MODEL_VERSION: "2026-01-01",
      AZURE_OPENAI_API_KEY: "never-return-this-azure-key",
    }, observedAt);

    expect(identity).toMatchObject({
      runtimeType: "azure_openai",
      provider: "azure_openai",
      endpointHostname: "safe.openai.azure.com",
      deploymentName: "deployment-safe",
      modelVersion: "2026-01-01",
      configurationStatus: "unsupported",
      inferenceStatus: "unavailable",
      evidenceType: "configuration_proof",
    });
    const serialized = JSON.stringify(identity);
    for (const forbidden of ["user:secret", "sig=private", "never-return-this-azure-key"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("distinguishes Azure Foundry configuration from a verified runtime", () => {
    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "azure_foundry",
      AZURE_AI_FOUNDRY_ENDPOINT: "https://foundry.example.azure.com/projects/aios",
      AZURE_AI_FOUNDRY_DEPLOYMENT: "mason-shared",
      AZURE_AI_FOUNDRY_API_KEY: "configured",
    }, observedAt);

    expect(identity).toMatchObject({
      runtimeType: "azure_foundry",
      deploymentName: "mason-shared",
      endpointHostname: "foundry.example.azure.com",
      configurationStatus: "unsupported",
      inferenceStatus: "unavailable",
      safeMessage: "azure_provider_adapter_not_implemented",
    });
  });
});

describe("minimal provider inference probe", () => {
  const environment = {
    AI_PROVIDER: "openai",
    AI_MODEL: "gpt-safe",
    OPENAI_API_KEY: "probe-secret",
  };

  it("returns authenticated runtime proof after a successful fixed probe", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "OK" } }],
    }), { status: 200 })) as typeof fetch;
    const result = await probeRuntimeIdentity({
      environment,
      fetchImpl,
      observedAt,
      maxAttempts: 1,
      clock: (() => {
        let current = 0;
        return () => (current += 100);
      })(),
    });

    expect(result).toMatchObject({
      status: "healthy",
      inferenceStatus: "healthy",
      evidenceType: "authenticated_runtime_proof",
      safeMessage: "provider_inference_probe_succeeded",
      safeErrorCode: null,
      latencyBucket: "under_1s",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("probe-secret");
    expect(serialized).not.toContain("OK");
  });

  it("reports provider failure truthfully without returning response content", async () => {
    const fetchImpl = vi.fn(async () => new Response("sensitive provider body", { status: 401 })) as typeof fetch;
    const result = await probeRuntimeIdentity({ environment, fetchImpl, observedAt, maxAttempts: 1 });

    expect(result).toMatchObject({
      status: "degraded",
      inferenceStatus: "failed",
      evidenceType: "authenticated_runtime_proof",
      safeErrorCode: "provider_unauthorized",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive provider body");
  });

  it("reports malformed successful responses as failed", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })) as typeof fetch;
    const result = await probeRuntimeIdentity({ environment, fetchImpl, observedAt, maxAttempts: 1 });

    expect(result).toMatchObject({
      status: "degraded",
      inferenceStatus: "failed",
      safeErrorCode: "malformed_provider_response",
    });
  });

  it("retries only within the configured bound for transient failures", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
      }), { status: 200 })) as typeof fetch;
    const result = await probeRuntimeIdentity({ environment, fetchImpl, observedAt, maxAttempts: 2 });

    expect(result.inferenceStatus).toBe("healthy");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("enforces a bounded timeout", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as typeof fetch;
    const result = await probeRuntimeIdentity({
      environment,
      fetchImpl,
      observedAt,
      timeoutMs: 250,
      maxAttempts: 1,
    });

    expect(result).toMatchObject({
      status: "degraded",
      inferenceStatus: "timeout",
      evidenceType: "authenticated_runtime_proof",
      safeErrorCode: "provider_timeout",
    });
  });

  it("does not probe when configuration cannot select a real provider", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await probeRuntimeIdentity({
      environment: { AI_PROVIDER: "mock" },
      fetchImpl,
      observedAt,
    });

    expect(result.inferenceStatus).toBe("not_applicable");
    expect(result.evidenceType).toBe("configuration_proof");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("canonical agent runtime mappings", () => {
  it("maps all ten agents without treating Julius, templates, or AirBid names as agents", () => {
    const identity = resolveRuntimeIdentity({
      AI_PROVIDER: "openai",
      AI_MODEL: "gpt-safe",
      OPENAI_API_KEY: "configured",
    }, observedAt);
    const mappings = getAgentRuntimeMappings(identity, observedAt);

    expect(hasCompleteCanonicalRuntimeMappings()).toBe(true);
    expect(mappings.map((mapping) => mapping.agentKey)).toEqual(AIOS_WORKFORCE.map((agent) => agent.key));
    expect(mappings).toHaveLength(10);
    expect(mappings.some((mapping) => mapping.agentName === JULIUS.name)).toBe(false);
    expect(mappings.some((mapping) => mapping.agentKey === ("engineering-manager" as never))).toBe(false);
    for (const reserved of ["Nexus", "Sentinel", "Guardian", "Oracle", "Compass"]) {
      expect(isReservedAirbidName(reserved)).toBe(true);
      expect(mappings.some((mapping) => mapping.agentName === reserved)).toBe(false);
    }
    expect(mappings.every((mapping) => mapping.evidenceType === "source_code_proof")).toBe(true);
    expect(mappings.every((mapping) => mapping.status === "degraded")).toBe(true);
    expect(mappings.every((mapping) => mapping.details.dedicatedDeploymentVerified === false)).toBe(true);
    expect(new Set(mappings.map((mapping) => mapping.sharedProviderRuntimeId))).toEqual(
      new Set(["aios.runtime.shared.openai"]),
    );
  });

  it("keeps Mason engineering execution deterministic and any external runtime unverified", () => {
    const identity = resolveRuntimeIdentity({ AI_PROVIDER: "mock" }, observedAt);
    const mason = getAgentRuntimeMappings(identity, observedAt).find((mapping) => mapping.agentKey === "mason");

    expect(mason).toMatchObject({
      runtimeMode: "hybrid_shared_deterministic_runtime",
      primaryExecution: "deterministic",
      sharedProviderRuntimeId: null,
      deterministicRuntimeId: "aios.runtime.deterministic.mason",
      externalRuntimeStatus: "externally_configured_unverified",
    });
    expect(mason?.deterministicCapabilities).toContain("runtime_readiness");
    expect(mason?.modelBackedCapabilities).toEqual(["agent_conversation"]);
  });
});
