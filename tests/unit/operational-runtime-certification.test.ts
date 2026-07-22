import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_RUNTIME_COMPONENTS,
  compareRuntimeCertificationSnapshots,
  createOperationalRuntimeCertification,
  createRuntimeConditionSnapshot,
  getOperationalRuntimeFoundation,
} from "@/lib/operational-runtime/certification";
import { resolveRuntimeIdentity } from "@/lib/runtime-identity/resolver";

const observedAt = "2026-07-22T18:00:00.000Z";
const safeEnvironment = {
  AI_PROVIDER: "azure",
  AI_MODEL: "gpt-5.6-sol",
  AZURE_OPENAI_ENDPOINT: "https://aios-harmony-foundry.openai.azure.com",
  AZURE_OPENAI_API_KEY: "never-return-this",
};

describe("operational runtime certification foundation", () => {
  it("defines one shared contract for every planned operational runtime", () => {
    const foundation = getOperationalRuntimeFoundation(observedAt);
    expect(foundation.map((item) => item.component)).toEqual(
      OPERATIONAL_RUNTIME_COMPONENTS,
    );
    expect(foundation).toHaveLength(6);
    expect(foundation.every((item) => item.status === "unknown")).toBe(true);
    expect(foundation.every(
      (item) => item.evidenceType === "source_code_proof",
    )).toBe(true);
    expect(foundation.every(
      (item) => item.details.liveProbeAttempted === false,
    )).toBe(true);
  });

  it("forbids operational healthy status without live evidence", () => {
    expect(() => createOperationalRuntimeCertification({
      component: "julius_retrieval",
      status: "healthy",
      evidenceType: "configuration_proof",
      observedBy: "test",
      confidence: 1,
      observedAt,
      liveProbeRequired: true,
      liveProbeAttempted: false,
      safeMessage: "not_live",
    })).toThrow("Operational runtime health requires a successful live probe.");
  });

  it("permits healthy status only for an attempted authenticated probe", () => {
    expect(createOperationalRuntimeCertification({
      component: "approval_runtime",
      status: "healthy",
      evidenceType: "authenticated_runtime_proof",
      observedBy: "test.approval.probe",
      confidence: 0.95,
      observedAt,
      liveProbeRequired: true,
      liveProbeAttempted: true,
      runtimeConditionId: "safe-condition",
      safeMessage: "approval_runtime_probe_succeeded",
    })).toMatchObject({
      component: "approval_runtime",
      status: "healthy",
      evidenceType: "authenticated_runtime_proof",
      runtimeConditionId: "safe-condition",
    });
  });

  it("creates stable condition IDs from allowlisted runtime identity fields", () => {
    const identity = resolveRuntimeIdentity(safeEnvironment, observedAt);
    const preview = createRuntimeConditionSnapshot({
      identity,
      logicVersion: "logic-v1",
      deploymentEnvironment: "preview",
      deploymentSha: "preview-sha",
    });
    const production = createRuntimeConditionSnapshot({
      identity,
      logicVersion: "logic-v1",
      deploymentEnvironment: "production",
      deploymentSha: "production-sha",
    });
    const changed = createRuntimeConditionSnapshot({
      identity: resolveRuntimeIdentity({ ...safeEnvironment, AI_MODEL: "other" }, observedAt),
      logicVersion: "logic-v1",
    });

    expect(preview.conditionId).toBe(production.conditionId);
    expect(changed.conditionId).not.toBe(preview.conditionId);
    expect(JSON.stringify(preview)).not.toContain("never-return-this");
    expect(preview).toMatchObject({
      provider: "azure",
      model: "gpt-5.6-sol",
      endpointHostname: "aios-harmony-foundry.openai.azure.com",
    });
  });

  it("never silently accepts outcomes that diverge under the same condition", () => {
    expect(compareRuntimeCertificationSnapshots(
      { conditionId: "same", outcomeId: "preview-healthy" },
      { conditionId: "same", outcomeId: "production-degraded" },
    )).toEqual({
      status: "unexplained_runtime_divergence",
      conditionMatches: true,
      outcomeMatches: false,
      safeMessage: "runtime_certification_outcome_diverged",
    });
    expect(compareRuntimeCertificationSnapshots(
      { conditionId: "preview-config", outcomeId: "healthy" },
      { conditionId: "production-config", outcomeId: "degraded" },
    )).toMatchObject({
      status: "verified_configuration_difference",
      conditionMatches: false,
    });
  });
});
