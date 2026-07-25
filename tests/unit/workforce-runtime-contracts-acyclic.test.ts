import { describe, expect, it } from "vitest";

import { WORKFORCE_RUNTIME_CONTRACTS } from "@/lib/workforce/runtime-contracts";
import { getMasonCapabilityRecord } from "@/lib/mason/capability-registry";
import { getAgentRuntimeMappings } from "@/lib/runtime-identity/agent-mappings";

describe("workforce runtime contracts acyclic dependency regression", () => {
  it("loads contracts, capability registry, and runtime mappings together", () => {
    expect(WORKFORCE_RUNTIME_CONTRACTS.harmony.key).toBe("harmony");
    expect(getMasonCapabilityRecord("mason").runtime.key).toBe("mason");

    const mappings = getAgentRuntimeMappings({
      provider: "azure_openai",
      model: "gpt-5",
      deploymentName: "shared",
      endpointHostname: "example.openai.azure.com",
      runtimeId: "runtime-1",
      sharedOrDedicated: "shared",
      status: "healthy",
      inferenceStatus: "not_attempted",
      inferenceLatencyMs: null,
      safeErrorCode: null,
      safeMessage: "not_probed",
      evidenceType: "configuration_proof",
      observedAt: new Date().toISOString(),
      observedBy: "tests.runtime_contracts_acyclic",
      confidence: 0.8,
      details: {
        endpointHostname: "example.openai.azure.com",
        deploymentName: "shared",
        model: "gpt-5",
        inferenceAttempted: false,
      },
    });

    expect(mappings.find((item) => item.agentKey === "harmony")?.executionCapability).toBe("guided_runtime");
    expect(mappings.find((item) => item.agentKey === "mason")?.unsupportedCapabilities).toContain("Unapproved merge");
  });
});
