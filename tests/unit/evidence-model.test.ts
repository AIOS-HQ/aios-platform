import { describe, expect, it } from "vitest";
import {
  createCertificationResult,
  evidenceTypeFromVercelTier,
} from "@/lib/evidence/certification";
import { createEvidence, EVIDENCE_TYPES } from "@/lib/evidence/model";

describe("canonical Evidence Layer", () => {
  it("exposes the complete canonical evidence vocabulary", () => {
    expect(EVIDENCE_TYPES).toEqual([
      "live_runtime_proof",
      "authenticated_runtime_proof",
      "configuration_proof",
      "source_code_proof",
      "documentation_only",
      "unknown",
    ]);
  });

  it("creates normalized runtime evidence", () => {
    const result = createEvidence({
      status: "healthy",
      evidenceType: "live_runtime_proof",
      observedAt: "2026-07-21T12:00:00.000Z",
      observedBy: "test.runtime",
      confidence: 1,
      details: { provider: "vercel" },
    });

    expect(result).toEqual({
      status: "healthy",
      evidenceType: "live_runtime_proof",
      observedAt: "2026-07-21T12:00:00.000Z",
      observedBy: "test.runtime",
      confidence: 1,
      details: { provider: "vercel" },
    });
  });

  it("rejects healthy claims backed only by source, documentation, or unknown evidence", () => {
    for (const evidenceType of ["source_code_proof", "documentation_only", "unknown"] as const) {
      expect(() => createEvidence({
        status: "healthy",
        evidenceType,
        observedBy: "test.runtime",
        confidence: 0.5,
        details: {},
      })).toThrow(/cannot support a healthy runtime status/);
    }
  });

  it("normalizes source proof to degraded and unavailable proof to unknown", () => {
    expect(createCertificationResult({
      outcome: true,
      evidenceType: "source_code_proof",
      observedBy: "test.certification",
      confidence: 1,
      details: {},
    }).status).toBe("degraded");

    expect(createCertificationResult({
      outcome: null,
      evidenceType: "unknown",
      observedBy: "test.certification",
      confidence: 0,
      details: {},
    }).status).toBe("unknown");
  });

  it("maps existing Vercel evidence tiers without overstating proof", () => {
    expect(evidenceTypeFromVercelTier("direct_vercel_api")).toBe("live_runtime_proof");
    expect(evidenceTypeFromVercelTier("github_vercel_deployment_status")).toBe("authenticated_runtime_proof");
    expect(evidenceTypeFromVercelTier("runtime_deployment_identity")).toBe("configuration_proof");
    expect(evidenceTypeFromVercelTier("unavailable")).toBe("unknown");
  });
});
