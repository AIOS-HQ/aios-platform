import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validatePromotionApprovalEvidence } from "../../scripts/ci/promotion-approval-evidence.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";

function validInput(overrides = {}) {
  return {
    subject: {
      repository: "AIOS-HQ/aios-platform",
      purpose: "production_promotion",
      targetSha: SHA,
      sourceEnvironment: "staging",
      targetEnvironment: "production",
      promotionRequestId: "promotion-request:abc123",
      previewCertificationWaiver: false,
      previewCertificationWaiverReason: null,
      runtimeEvidenceId: "runtime-evidence:123",
      runtimeArtifactId: "github-artifact:22222",
      migrationEvidenceId: "migration-evidence:456",
      migrationArtifactId: "github-artifact:33333",
    },
    founderApproval: {
      promotionRequestId: "promotion-request:abc123",
      targetSha: SHA,
      purpose: "production_promotion",
      authority: "founder",
      decision: "approved",
      actorType: "founder",
      actorId: "founder-1",
      evidenceId: "founder-approval:789",
      approvedAt: "2026-08-08T10:00:00.000Z",
      runtimeEvidenceId: "runtime-evidence:123",
      runtimeArtifactId: "github-artifact:22222",
      migrationEvidenceId: "migration-evidence:456",
      migrationArtifactId: "github-artifact:33333",
    },
    harmonyGovernanceApproval: {
      promotionRequestId: "promotion-request:abc123",
      targetSha: SHA,
      purpose: "production_promotion",
      authority: "harmony",
      decision: "approved",
      agentId: "harmony",
      evidenceId: "harmony-approval:987",
      approvedAt: "2026-08-08T10:01:00.000Z",
      governancePolicyVersion: "governance-policy:v1",
      runtimeEvidenceId: "runtime-evidence:123",
      runtimeArtifactId: "github-artifact:22222",
      migrationEvidenceId: "migration-evidence:456",
      migrationArtifactId: "github-artifact:33333",
    },
    ...overrides,
  };
}

describe("promotion approval evidence contract", () => {
  it("valid independent Founder + Harmony evidence succeeds", () => {
    const out = validatePromotionApprovalEvidence(validInput(), { expectedSha: SHA });
    expect(out.subject.targetSha).toBe(SHA);
    expect(out.founderApproval).toMatchObject({
      status: "approved",
      actorType: "founder",
      actorId: "founder-1",
    });
    expect(out.harmonyGovernanceApproval).toMatchObject({
      status: "approved",
      agentId: "harmony",
    });
  });

  it("fails closed for wrong repository, malformed SHA, expected SHA mismatch, purpose/env mismatches", () => {
    expect(() => validatePromotionApprovalEvidence(validInput({ subject: { ...validInput().subject, repository: "evil/repo" } }), { expectedSha: SHA }))
      .toThrow(/repository_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ subject: { ...validInput().subject, targetSha: "deadbeef" } }), { expectedSha: SHA }))
      .toThrow(/target_sha_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput(), { expectedSha: "a".repeat(40) }))
      .toThrow(/target_sha_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ subject: { ...validInput().subject, purpose: "generic_approval" } }), { expectedSha: SHA }))
      .toThrow(/purpose_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ subject: { ...validInput().subject, sourceEnvironment: "preview" } }), { expectedSha: SHA }))
      .toThrow(/source_environment_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ subject: { ...validInput().subject, targetEnvironment: "staging" } }), { expectedSha: SHA }))
      .toThrow(/target_environment_mismatch/);
  });

  it("fails closed for promotionRequestId mismatch and mutable refs", () => {
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, promotionRequestId: "other" } }), { expectedSha: SHA }))
      .toThrow(/founder_request_id_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, promotionRequestId: "other" } }), { expectedSha: SHA }))
      .toThrow(/harmony_request_id_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ subject: { ...validInput().subject, runtimeEvidenceId: "latest" } }), { expectedSha: SHA }))
      .toThrow(/runtime_evidence_id_invalid/);
  });

  it("accepts waiver mode with null runtime ids and governed waiver reason", () => {
    const waived = validInput({
      subject: {
        ...validInput().subject,
        previewCertificationWaiver: true,
        previewCertificationWaiverReason: "preview_certification_contract_incompatibility",
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
      founderApproval: {
        ...validInput().founderApproval,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
      harmonyGovernanceApproval: {
        ...validInput().harmonyGovernanceApproval,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
    });

    const out = validatePromotionApprovalEvidence(waived, { expectedSha: SHA });
    expect(out.subject.previewCertificationWaiver).toBe(true);
    expect(out.subject.previewCertificationWaiverReason).toBe("preview_certification_contract_incompatibility");
    expect(out.subject.runtimeEvidenceId).toBe(null);
    expect(out.subject.runtimeArtifactId).toBe(null);
  });

  it("fails closed on mixed waiver/non-waiver runtime evidence combinations", () => {
    expect(() => validatePromotionApprovalEvidence(validInput({
      subject: {
        ...validInput().subject,
        previewCertificationWaiver: true,
        previewCertificationWaiverReason: "preview_certification_contract_incompatibility",
        runtimeEvidenceId: "runtime-evidence:123",
      },
      founderApproval: {
        ...validInput().founderApproval,
        runtimeEvidenceId: "runtime-evidence:123",
      },
      harmonyGovernanceApproval: {
        ...validInput().harmonyGovernanceApproval,
        runtimeEvidenceId: "runtime-evidence:123",
      },
    }), { expectedSha: SHA })).toThrow(/runtime_evidence_id_invalid/);

    expect(() => validatePromotionApprovalEvidence(validInput({
      subject: {
        ...validInput().subject,
        previewCertificationWaiver: true,
        previewCertificationWaiverReason: "wrong_reason",
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
      founderApproval: {
        ...validInput().founderApproval,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
      harmonyGovernanceApproval: {
        ...validInput().harmonyGovernanceApproval,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
    }), { expectedSha: SHA })).toThrow(/preview_certification_waiver_reason_invalid/);

    expect(() => validatePromotionApprovalEvidence(validInput({
      subject: {
        ...validInput().subject,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
      founderApproval: {
        ...validInput().founderApproval,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
      harmonyGovernanceApproval: {
        ...validInput().harmonyGovernanceApproval,
        runtimeEvidenceId: null,
        runtimeArtifactId: null,
      },
    }), { expectedSha: SHA })).toThrow(/runtime_evidence_id_invalid/);
  });

  it("fails closed for Founder missing/invalid authority/decision/actor/target/evidence linkage", () => {
    const missingFounder = validInput();
    delete missingFounder.founderApproval;
    expect(() => validatePromotionApprovalEvidence(missingFounder, { expectedSha: SHA })).toThrow(/founder_missing/);
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, decision: "pending_approval" } }), { expectedSha: SHA }))
      .toThrow(/founder_decision_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, authority: "user" } }), { expectedSha: SHA }))
      .toThrow(/founder_authority_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, actorId: "" } }), { expectedSha: SHA }))
      .toThrow(/founder_actor_id_missing/);
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, targetSha: "a".repeat(40) } }), { expectedSha: SHA }))
      .toThrow(/founder_target_sha_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, runtimeEvidenceId: "x" } }), { expectedSha: SHA }))
      .toThrow(/founder_runtime_evidence_mismatch/);
  });

  it("fails closed for Harmony missing/invalid decision/agent/target/evidence/policy version", () => {
    const missingHarmony = validInput();
    delete missingHarmony.harmonyGovernanceApproval;
    expect(() => validatePromotionApprovalEvidence(missingHarmony, { expectedSha: SHA })).toThrow(/harmony_missing/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, decision: "pending_approval" } }), { expectedSha: SHA }))
      .toThrow(/harmony_decision_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, decision: "auto_executed" } }), { expectedSha: SHA }))
      .toThrow(/harmony_decision_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, decision: "notified" } }), { expectedSha: SHA }))
      .toThrow(/harmony_decision_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, agentId: "agent-x" } }), { expectedSha: SHA }))
      .toThrow(/harmony_agent_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, targetSha: "a".repeat(40) } }), { expectedSha: SHA }))
      .toThrow(/harmony_target_sha_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, runtimeArtifactId: "x" } }), { expectedSha: SHA }))
      .toThrow(/harmony_runtime_artifact_mismatch/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, governancePolicyVersion: "" } }), { expectedSha: SHA }))
      .toThrow(/harmony_policy_version_invalid/);
  });

  it("fails closed for generic harmony audit-shaped object and duplicate evidence IDs", () => {
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: {
      agent: "harmony",
      decision: "approved",
      targetSha: SHA,
      approvedAt: "2026-08-08T10:01:00.000Z",
    } }), { expectedSha: SHA })).toThrow(/harmony_purpose_mismatch|harmony_authority_invalid/);

    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: {
      ...validInput().harmonyGovernanceApproval,
      evidenceId: validInput().founderApproval.evidenceId,
    } }), { expectedSha: SHA })).toThrow(/approval_evidence_ids_must_differ/);

    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: {
      ...validInput().harmonyGovernanceApproval,
      decision: "pending_approval",
    } }), { expectedSha: SHA })).toThrow(/harmony_decision_invalid/);

    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: {
      ...validInput().harmonyGovernanceApproval,
      decision: "auto_executed",
    } }), { expectedSha: SHA })).toThrow(/harmony_decision_invalid/);

    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: {
      ...validInput().harmonyGovernanceApproval,
      decision: "notified",
    } }), { expectedSha: SHA })).toThrow(/harmony_decision_invalid/);
  });

  it("fails closed for malformed timestamps and sensitive keys/values", () => {
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, approvedAt: "not-a-date" } }), { expectedSha: SHA }))
      .toThrow(/founder_approved_at_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, approvedAt: "not-a-date" } }), { expectedSha: SHA }))
      .toThrow(/harmony_approved_at_invalid/);
    expect(() => validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, token: "secret" } }), { expectedSha: SHA }))
      .toThrow(/sensitive_key_rejected/);
    expect(() => validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, leak: "postgres://user:pw@host/db" } }), { expectedSha: SHA }))
      .toThrow(/sensitive_value_rejected/);
  });

  it("produces deterministic bundle ID and changes on immutable evidence identity changes", () => {
    const first = validatePromotionApprovalEvidence(validInput(), { expectedSha: SHA });
    const second = validatePromotionApprovalEvidence(validInput(), { expectedSha: SHA });
    expect(first.bundleId).toMatch(/^promotion-approval-bundle:[0-9a-f]{64}$/);
    expect(first.bundleId).toBe(second.bundleId);

    const founderChanged = validatePromotionApprovalEvidence(validInput({ founderApproval: { ...validInput().founderApproval, evidenceId: "founder-approval:new" } }), { expectedSha: SHA });
    expect(founderChanged.bundleId).not.toBe(first.bundleId);

    const harmonyChanged = validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, evidenceId: "harmony-approval:new" } }), { expectedSha: SHA });
    expect(harmonyChanged.bundleId).not.toBe(first.bundleId);

    const policyChanged = validatePromotionApprovalEvidence(validInput({ harmonyGovernanceApproval: { ...validInput().harmonyGovernanceApproval, governancePolicyVersion: "governance-policy:v2" } }), { expectedSha: SHA });
    expect(policyChanged.bundleId).not.toBe(first.bundleId);
  });

  it("executes real CLI success and fail-closed expected SHA mismatch", () => {
    const tmp = mkdtempSync(join(tmpdir(), "promotion-approval-evidence-"));
    try {
      const inputPath = join(tmp, "input.json");
      writeFileSync(inputPath, `${JSON.stringify(validInput(), null, 2)}\n`, "utf8");
      const cliPath = resolve("scripts/ci/promotion-approval-evidence.mjs");

      const success = spawnSync(process.execPath, [cliPath, "validate", inputPath, SHA], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(success.status).toBe(0);
      const out = JSON.parse(success.stdout);
      expect(out.subject.targetSha).toBe(SHA);
      expect(out.founderApproval.status).toBe("approved");
      expect(out.harmonyGovernanceApproval.agentId).toBe("harmony");

      const failMismatch = spawnSync(process.execPath, [cliPath, "validate", inputPath, "a".repeat(40)], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(failMismatch.status).not.toBe(0);
      expect(failMismatch.stderr).toContain("target_sha_mismatch");
      expect(failMismatch.stderr).not.toContain("promotionRequestId");
      expect(failMismatch.stderr).not.toContain("founderApproval");
      expect(failMismatch.stderr).not.toContain("harmonyGovernanceApproval");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
