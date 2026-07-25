import { describe, expect, it } from "vitest";

import { listMasonCapabilities } from "@/lib/mason/capability-registry";

describe("mason capability registry metadata completeness", () => {
  it("exposes canonical structured metadata for every capability", () => {
    const capabilities = listMasonCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);
    for (const capability of capabilities) {
      expect(capability.capabilityId).toBeTruthy();
      expect(capability.agent).toBeTruthy();
      expect(capability.category).toBeTruthy();
      expect(capability.implementationStatus).toBeTruthy();
      expect(capability.evidenceSource).toBeTruthy();
      expect(capability.evidenceClass).toBeTruthy();
      expect(capability.runtimeState).toBeTruthy();
      expect(capability.governanceBoundary).toBeTruthy();
      expect(capability.approvalRequirement).toBeTruthy();
      expect(Array.isArray(capability.connectorDependencies)).toBe(true);
      expect(Array.isArray(capability.infrastructureDependencies)).toBe(true);
      expect(Array.isArray(capability.credentialDependencies)).toBe(true);
      expect(Array.isArray(capability.productionDependencies)).toBe(true);
      expect(capability.validationStatus).toBeTruthy();
      expect(capability.readinessStatus).toBeTruthy();
      expect("lastVerifiedAt" in capability).toBe(true);
      expect("blockerReason" in capability).toBe(true);
      expect(capability.nextRequiredAction).toBeTruthy();
    }
  });
});

