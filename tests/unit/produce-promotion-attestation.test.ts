import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { producePromotionAttestation } from "../../scripts/ci/produce-promotion-attestation.mjs";
import { validatePromotionAttestation } from "../../scripts/ci/promotion-attestation-contract.mjs";

const SHA = "e34a7fb2bc8ee8cc9f1f5c1a4273f49e541ef300";

function validInput() {
  return {
    expectedTargetSha: SHA,
    stagingPromotionEvidence: {
      repository: "AIOS-HQ/aios-platform",
      sourceEnvironment: "staging",
      targetEnvironment: "production",
      targetSha: SHA,
      runtimeCertification: {
        status: "passed",
        targetSha: SHA,
        evidenceId: "runtime-evidence:123",
        artifactId: "github-artifact:22222",
        verifiedAt: "2026-08-08T10:00:00.000Z",
      },
      migrationPlanCertification: {
        status: "passed",
        targetSha: SHA,
        evidenceId: "migration-evidence:456",
        artifactId: "github-artifact:33333",
        verifiedAt: "2026-08-08T10:01:00.000Z",
      },
    },
    promotionApprovalEvidence: {
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
        governancePolicyVersion: "production-promotion-governance-v1",
        runtimeEvidenceId: "runtime-evidence:123",
        runtimeArtifactId: "github-artifact:22222",
        migrationEvidenceId: "migration-evidence:456",
        migrationArtifactId: "github-artifact:33333",
      },
    },
  };
}

describe("producePromotionAttestation", () => {
  it("valid composition passes M5A contract", () => {
    const produced = producePromotionAttestation(validInput());
    const contract = validatePromotionAttestation(produced, { expectedSha: SHA });
    expect(contract.ok).toBe(true);
  });

  it("fails closed on target SHA mismatch", () => {
    const input = validInput();
    input.promotionApprovalEvidence.subject.targetSha = "a".repeat(40);
    expect(() => producePromotionAttestation(input)).toThrow(/target_sha_mismatch/);
  });

  it("fails closed on runtime evidence mismatch", () => {
    const input = validInput();
    input.promotionApprovalEvidence.subject.runtimeEvidenceId = "runtime-evidence:other";
    input.promotionApprovalEvidence.founderApproval.runtimeEvidenceId = "runtime-evidence:other";
    input.promotionApprovalEvidence.harmonyGovernanceApproval.runtimeEvidenceId = "runtime-evidence:other";
    expect(() => producePromotionAttestation(input)).toThrow(/runtime_evidence_id_mismatch/);
  });

  it("fails closed on runtime artifact mismatch", () => {
    const input = validInput();
    input.promotionApprovalEvidence.subject.runtimeArtifactId = "github-artifact:99999";
    input.promotionApprovalEvidence.founderApproval.runtimeArtifactId = "github-artifact:99999";
    input.promotionApprovalEvidence.harmonyGovernanceApproval.runtimeArtifactId = "github-artifact:99999";
    expect(() => producePromotionAttestation(input)).toThrow(/runtime_artifact_id_mismatch/);
  });

  it("fails closed on migration evidence mismatch", () => {
    const input = validInput();
    input.promotionApprovalEvidence.subject.migrationEvidenceId = "migration-evidence:other";
    input.promotionApprovalEvidence.founderApproval.migrationEvidenceId = "migration-evidence:other";
    input.promotionApprovalEvidence.harmonyGovernanceApproval.migrationEvidenceId = "migration-evidence:other";
    expect(() => producePromotionAttestation(input)).toThrow(/migration_evidence_id_mismatch/);
  });

  it("fails closed on migration artifact mismatch", () => {
    const input = validInput();
    input.promotionApprovalEvidence.subject.migrationArtifactId = "github-artifact:99998";
    input.promotionApprovalEvidence.founderApproval.migrationArtifactId = "github-artifact:99998";
    input.promotionApprovalEvidence.harmonyGovernanceApproval.migrationArtifactId = "github-artifact:99998";
    expect(() => producePromotionAttestation(input)).toThrow(/migration_artifact_id_mismatch/);
  });

  it("fails closed on rejected/missing approvals", () => {
    const rejectedFounder = validInput();
    rejectedFounder.promotionApprovalEvidence.founderApproval.decision = "rejected";
    expect(() => producePromotionAttestation(rejectedFounder)).toThrow(/founder_decision_invalid/);

    const missingHarmony = validInput();
    delete missingHarmony.promotionApprovalEvidence.harmonyGovernanceApproval;
    expect(() => producePromotionAttestation(missingHarmony)).toThrow(/harmony_missing|harmony_approval_missing/);
  });

  it("preserves existing evidence and approval identities exactly", () => {
    const input = validInput();
    const produced = producePromotionAttestation(input);

    expect(produced.runtimeCertification.evidenceId).toBe(input.stagingPromotionEvidence.runtimeCertification.evidenceId);
    expect(produced.runtimeCertification.artifactId).toBe(input.stagingPromotionEvidence.runtimeCertification.artifactId);
    expect(produced.migrationPlanCertification.evidenceId).toBe(input.stagingPromotionEvidence.migrationPlanCertification.evidenceId);
    expect(produced.migrationPlanCertification.artifactId).toBe(input.stagingPromotionEvidence.migrationPlanCertification.artifactId);

    expect(produced.founderApproval.evidenceId).toBe(input.promotionApprovalEvidence.founderApproval.evidenceId);
    expect(produced.founderApproval.approvedAt).toBe(input.promotionApprovalEvidence.founderApproval.approvedAt);
    expect(produced.founderApproval.actorId).toBe(input.promotionApprovalEvidence.founderApproval.actorId);

    expect(produced.harmonyGovernanceApproval.evidenceId).toBe(input.promotionApprovalEvidence.harmonyGovernanceApproval.evidenceId);
    expect(produced.harmonyGovernanceApproval.approvedAt).toBe(input.promotionApprovalEvidence.harmonyGovernanceApproval.approvedAt);
    expect(produced.harmonyGovernanceApproval.agentId).toBe(input.promotionApprovalEvidence.harmonyGovernanceApproval.agentId);
  });

  it("only generates attestation issuedAt/verifiedAt timestamps", () => {
    const input = validInput();
    const produced = producePromotionAttestation(input);

    expect(produced.issuedAt).toBeTruthy();
    expect(produced.verifiedAt).toBeTruthy();

    expect(produced.runtimeCertification.verifiedAt).toBe(input.stagingPromotionEvidence.runtimeCertification.verifiedAt);
    expect(produced.migrationPlanCertification.verifiedAt).toBe(input.stagingPromotionEvidence.migrationPlanCertification.verifiedAt);
    expect(produced.founderApproval.approvedAt).toBe(input.promotionApprovalEvidence.founderApproval.approvedAt);
    expect(produced.harmonyGovernanceApproval.approvedAt).toBe(input.promotionApprovalEvidence.harmonyGovernanceApproval.approvedAt);
  });

  it("CLI produce writes valid M5A attestation JSON file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "promotion-attestation-cli-"));
    try {
      const inputPath = join(tmp, "input.json");
      const outputPath = join(tmp, "output.json");
      const input = validInput();
      writeFileSync(inputPath, JSON.stringify({
        stagingPromotionEvidence: input.stagingPromotionEvidence,
        promotionApprovalEvidence: input.promotionApprovalEvidence,
      }));

      const cliPath = resolve("scripts/ci/produce-promotion-attestation.mjs");
      const run = spawnSync(process.execPath, [cliPath, "produce", inputPath, SHA, outputPath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(run.status).toBe(0);
      const output = JSON.parse(readFileSync(outputPath, "utf8"));
      const validated = validatePromotionAttestation(output, { expectedSha: SHA });
      expect(validated.ok).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("CLI produce exits nonzero on wrong expected SHA", () => {
    const tmp = mkdtempSync(join(tmpdir(), "promotion-attestation-cli-"));
    try {
      const inputPath = join(tmp, "input.json");
      const outputPath = join(tmp, "output.json");
      const input = validInput();
      writeFileSync(inputPath, JSON.stringify({
        stagingPromotionEvidence: input.stagingPromotionEvidence,
        promotionApprovalEvidence: input.promotionApprovalEvidence,
      }));

      const cliPath = resolve("scripts/ci/produce-promotion-attestation.mjs");
      const run = spawnSync(process.execPath, [cliPath, "produce", inputPath, "a".repeat(40), outputPath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("target_sha_mismatch");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("CLI produce exits nonzero on malformed input", () => {
    const tmp = mkdtempSync(join(tmpdir(), "promotion-attestation-cli-"));
    try {
      const inputPath = join(tmp, "input.json");
      const outputPath = join(tmp, "output.json");
      writeFileSync(inputPath, "not-json");

      const cliPath = resolve("scripts/ci/produce-promotion-attestation.mjs");
      const run = spawnSync(process.execPath, [cliPath, "produce", inputPath, SHA, outputPath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("input_parse_failed");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
