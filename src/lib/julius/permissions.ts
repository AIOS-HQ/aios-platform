import "server-only";

import { AIOS_WORKFORCE } from "@/lib/workforce/registry";
import type { JuliusOutcomeCategory } from "@/lib/julius/writeback";

export type WorkforceWorkerId = (typeof AIOS_WORKFORCE)[number]["key"];

export type JuliusRetrievalCategory =
  | "engineering_history"
  | "architecture_decisions"
  | "company_policies"
  | "execution_failures"
  | "rollback_recovery"
  | "communications_history"
  | "connector_outcomes"
  | "ledger_history"
  | "governance_audit"
  | "knowledge_stewardship";

export type JuliusStewardshipAction =
  | "dedupe_review"
  | "source_quality_review"
  | "index_curation_request"
  | "knowledge_quality_classification"
  | "merge_reject_recommendation";

export interface JuliusWorkerPermissions {
  workerId: WorkforceWorkerId;
  retrieval: JuliusRetrievalCategory[];
  write: JuliusOutcomeCategory[];
  approvalRequired: JuliusOutcomeCategory[];
  denied: string[];
  supportsExecutableRuntime: boolean;
  supportsStewardshipMetadata?: boolean;
}

const ALL_WRITE: JuliusOutcomeCategory[] = [
  "engineering_completion",
  "engineering_decision",
  "failure_lesson",
  "rollback_lesson",
  "recovery_lesson",
  "founder_clarification",
  "approved_blocker",
];

const NONE: JuliusOutcomeCategory[] = [];

export const JULIUS_WORKER_PERMISSIONS: Record<WorkforceWorkerId, JuliusWorkerPermissions> = {
  harmony: {
    workerId: "harmony",
    retrieval: ["company_policies", "governance_audit", "engineering_history"],
    write: ["founder_clarification", "approved_blocker"],
    approvalRequired: ["founder_clarification", "approved_blocker"],
    denied: ["direct_worker_rewrite", "cross_company", "secret_persistence"],
    supportsExecutableRuntime: true,
  },
  mason: {
    workerId: "mason",
    retrieval: [
      "engineering_history",
      "architecture_decisions",
      "execution_failures",
      "rollback_recovery",
      "company_policies",
    ],
    write: [
      "engineering_completion",
      "engineering_decision",
      "failure_lesson",
      "rollback_lesson",
      "recovery_lesson",
      "approved_blocker",
      "founder_clarification",
    ],
    approvalRequired: ["engineering_decision", "approved_blocker", "founder_clarification"],
    denied: ["cross_company", "secret_persistence", "unverified_promotion"],
    supportsExecutableRuntime: true,
  },
  catalyst: {
    workerId: "catalyst",
    retrieval: ["connector_outcomes", "company_policies"],
    write: ["engineering_completion", "failure_lesson"],
    approvalRequired: ["engineering_completion"],
    denied: ["cross_company", "secret_persistence", "unverified_promotion"],
    supportsExecutableRuntime: true,
  },
  ambassador: {
    workerId: "ambassador",
    retrieval: ["communications_history", "company_policies"],
    write: ["engineering_completion", "failure_lesson", "approved_blocker"],
    approvalRequired: ["approved_blocker"],
    denied: ["cross_company", "secret_persistence", "unverified_promotion"],
    supportsExecutableRuntime: true,
  },
  atlas: {
    workerId: "atlas",
    retrieval: ["knowledge_stewardship", "governance_audit", "company_policies"],
    write: NONE,
    approvalRequired: NONE,
    denied: [
      "cross_company",
      "secret_persistence",
      "silent_history_rewrite",
      "source_fabrication",
      "unverified_promotion",
      "unrestricted_administrator",
    ],
    supportsExecutableRuntime: false,
    supportsStewardshipMetadata: true,
  },
  auditor: {
    workerId: "auditor",
    retrieval: ["governance_audit", "company_policies"],
    write: NONE,
    approvalRequired: NONE,
    denied: ["cross_company", "secret_persistence", "fake_runtime_write"],
    supportsExecutableRuntime: false,
  },
  pulse: {
    workerId: "pulse",
    retrieval: ["connector_outcomes", "company_policies"],
    write: NONE,
    approvalRequired: NONE,
    denied: ["cross_company", "secret_persistence", "fake_runtime_write"],
    supportsExecutableRuntime: false,
  },
  horizon: {
    workerId: "horizon",
    retrieval: ["company_policies"],
    write: NONE,
    approvalRequired: NONE,
    denied: ["cross_company", "secret_persistence", "fake_runtime_write"],
    supportsExecutableRuntime: false,
  },
  aegis: {
    workerId: "aegis",
    retrieval: ["governance_audit", "company_policies"],
    write: NONE,
    approvalRequired: NONE,
    denied: ["cross_company", "secret_persistence", "fake_runtime_write"],
    supportsExecutableRuntime: false,
  },
  ledger: {
    workerId: "ledger",
    retrieval: ["ledger_history", "governance_audit", "company_policies"],
    write: NONE,
    approvalRequired: NONE,
    denied: ["cross_company", "secret_persistence", "fake_runtime_write"],
    supportsExecutableRuntime: false,
  },
};

export function getJuliusWorkerPermissions(workerId: string): JuliusWorkerPermissions | null {
  const permissions = JULIUS_WORKER_PERMISSIONS[workerId as WorkforceWorkerId];
  return permissions ?? null;
}

export function enforceJuliusWritePermission(input: {
  workerId: string;
  category: JuliusOutcomeCategory;
  verified: boolean;
  companyId: string;
  expectedCompanyId: string;
  policyApproved: boolean;
  hasExecutableRuntime: boolean;
}): { allowed: true; approvalRequired: boolean } | { allowed: false; reason: string } {
  const permissions = getJuliusWorkerPermissions(input.workerId);
  if (!permissions) return { allowed: false, reason: "unknown_worker" };

  if (!input.companyId || input.companyId !== input.expectedCompanyId) {
    return { allowed: false, reason: "cross_company_denied" };
  }

  if (!input.hasExecutableRuntime || !permissions.supportsExecutableRuntime) {
    return { allowed: false, reason: "unsupported_worker_runtime" };
  }

  if (!input.verified) return { allowed: false, reason: "unverified_outcome" };

  if (!permissions.write.includes(input.category)) {
    return { allowed: false, reason: "category_not_allowed" };
  }

  const approvalRequired = permissions.approvalRequired.includes(input.category);
  if (approvalRequired && !input.policyApproved) {
    return { allowed: false, reason: "approval_required" };
  }

  return { allowed: true, approvalRequired };
}

export function enforceAtlasStewardshipPolicy(input: {
  action: JuliusStewardshipAction;
  companyId: string;
  expectedCompanyId: string;
  verifiedSource: boolean;
  includesSecretLikeMetadata: boolean;
}): { allowed: true } | { allowed: false; reason: string } {
  const atlas = JULIUS_WORKER_PERMISSIONS.atlas;
  if (!atlas.supportsStewardshipMetadata) {
    return { allowed: false, reason: "atlas_stewardship_not_enabled" };
  }

  if (!input.companyId || input.companyId !== input.expectedCompanyId) {
    return { allowed: false, reason: "cross_company_denied" };
  }

  if (!input.verifiedSource) {
    return { allowed: false, reason: "source_fabrication_denied" };
  }

  if (input.includesSecretLikeMetadata) {
    return { allowed: false, reason: "secret_metadata_denied" };
  }

  switch (input.action) {
    case "dedupe_review":
    case "source_quality_review":
    case "index_curation_request":
    case "knowledge_quality_classification":
    case "merge_reject_recommendation":
      return { allowed: true };
  }
}

export { ALL_WRITE };
