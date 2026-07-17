import { describe, expect, it } from "vitest";

import {
  JULIUS_WORKER_PERMISSIONS,
  enforceAtlasStewardshipPolicy,
  enforceJuliusWritePermission,
} from "@/lib/julius/permissions";

describe("Julius workforce permissions", () => {
  it("allows Mason verified engineering completion", () => {
    const result = enforceJuliusWritePermission({
      workerId: "mason",
      category: "engineering_completion",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: true,
    });

    expect(result.allowed).toBe(true);
  });

  it("preserves harmony attribution limits", () => {
    const result = enforceJuliusWritePermission({
      workerId: "harmony",
      category: "founder_clarification",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: true,
    });

    expect(result.allowed).toBe(true);
  });

  it("allows catalyst role-limited write only in allowed categories", () => {
    const allow = enforceJuliusWritePermission({
      workerId: "catalyst",
      category: "engineering_completion",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: true,
    });
    const deny = enforceJuliusWritePermission({
      workerId: "catalyst",
      category: "founder_clarification",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: true,
    });

    expect(allow.allowed).toBe(true);
    expect(deny).toEqual({ allowed: false, reason: "category_not_allowed" });
  });

  it("allows ambassador role-limited write only in allowed categories", () => {
    const allow = enforceJuliusWritePermission({
      workerId: "ambassador",
      category: "approved_blocker",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: true,
    });
    const deny = enforceJuliusWritePermission({
      workerId: "ambassador",
      category: "engineering_decision",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: true,
    });

    expect(allow.allowed).toBe(true);
    expect(deny).toEqual({ allowed: false, reason: "category_not_allowed" });
  });

  it("denies unsupported worker fake writes", () => {
    const result = enforceJuliusWritePermission({
      workerId: "auditor",
      category: "engineering_completion",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: false,
    });

    expect(result).toEqual({ allowed: false, reason: "unsupported_worker_runtime" });
  });

  it("denies registered-only worker writes", () => {
    const result = enforceJuliusWritePermission({
      workerId: "ledger",
      category: "failure_lesson",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: true,
      hasExecutableRuntime: false,
    });

    expect(result).toEqual({ allowed: false, reason: "unsupported_worker_runtime" });
  });

  it("denies cross-company access", () => {
    const result = enforceJuliusWritePermission({
      workerId: "mason",
      category: "engineering_completion",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c2",
      policyApproved: true,
      hasExecutableRuntime: true,
    });

    expect(result).toEqual({ allowed: false, reason: "cross_company_denied" });
  });

  it("enforces approval-required categories", () => {
    const result = enforceJuliusWritePermission({
      workerId: "mason",
      category: "engineering_decision",
      verified: true,
      companyId: "c1",
      expectedCompanyId: "c1",
      policyApproved: false,
      hasExecutableRuntime: true,
    });

    expect(result).toEqual({ allowed: false, reason: "approval_required" });
  });
});

describe("Atlas stewardship policy", () => {
  it("allows governed stewardship metadata actions", () => {
    const result = enforceAtlasStewardshipPolicy({
      action: "dedupe_review",
      companyId: "c1",
      expectedCompanyId: "c1",
      verifiedSource: true,
      includesSecretLikeMetadata: false,
    });

    expect(result).toEqual({ allowed: true });
  });

  it("denies atlas overreach and source fabrication", () => {
    const overreach = enforceAtlasStewardshipPolicy({
      action: "merge_reject_recommendation",
      companyId: "c1",
      expectedCompanyId: "c1",
      verifiedSource: false,
      includesSecretLikeMetadata: false,
    });

    expect(overreach).toEqual({ allowed: false, reason: "source_fabrication_denied" });
  });

  it("denies cross-company stewardship", () => {
    const result = enforceAtlasStewardshipPolicy({
      action: "index_curation_request",
      companyId: "c1",
      expectedCompanyId: "c2",
      verifiedSource: true,
      includesSecretLikeMetadata: false,
    });

    expect(result).toEqual({ allowed: false, reason: "cross_company_denied" });
  });

  it("denies secret metadata access", () => {
    const result = enforceAtlasStewardshipPolicy({
      action: "source_quality_review",
      companyId: "c1",
      expectedCompanyId: "c1",
      verifiedSource: true,
      includesSecretLikeMetadata: true,
    });

    expect(result).toEqual({ allowed: false, reason: "secret_metadata_denied" });
  });
});

describe("permissions registry completeness", () => {
  it("includes all authoritative workers", () => {
    expect(Object.keys(JULIUS_WORKER_PERMISSIONS).sort()).toEqual([
      "aegis",
      "ambassador",
      "atlas",
      "auditor",
      "catalyst",
      "harmony",
      "horizon",
      "ledger",
      "mason",
      "pulse",
    ]);
  });
});
