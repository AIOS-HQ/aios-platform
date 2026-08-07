"use server";

import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { planInstall, planUpdate, planRollback, planUninstall } from "./install";
import { loadCatalog, loadInstallState } from "./persistence";
import type { Catalog, InstallActionKind, InstallPlan } from "./types";

/**
 * Marketplace install lifecycle — server actions (Founder-approved persistence).
 *
 * Each action loads the RLS-scoped catalog + the company's installed-state, asks
 * the pure engine for a plan (dependencies resolved; cycles/conflicts detected;
 * uninstall blocked on dependents), and only then applies it — writing
 * owner-scoped rows to `company_installations`. Every write is guarded by
 * company ownership AND RLS (auth.uid() = user_id). A blocked plan is returned
 * as-is and nothing is written, so the human always sees why before anything
 * changes. Marketplace assets are config/knowledge only — no secrets move.
 */

export interface ApplyResult {
  plan: InstallPlan;
  applied: boolean;
  decision?: "applied" | "blocked";
  reasonCode?: string;
  evidenceId?: string;
  error?: string;
}

export interface MarketplaceInstallPolicyEvidence {
  decision: "allow" | "deny";
  approvedAt: string;
  evaluatedAt: string;
  expiresAt?: string;
  actor: {
    type: "founder";
    id: string;
  };
  agent: {
    id: "harmony";
  };
  companyId: string;
  subject: {
    kind: "marketplace_install";
    itemId: string;
    version?: string;
    action: "install";
  };
  executionIdentity: {
    executionId: string;
    requestId: string;
    correlationId: string;
  };
}

export interface InstallMarketplacePolicyInput {
  policyEvidence: MarketplaceInstallPolicyEvidence;
}

export interface MarketplaceUpdatePolicyEvidence {
  decision: "allow" | "deny";
  approvedAt: string;
  evaluatedAt: string;
  expiresAt?: string;
  actor: {
    type: "founder";
    id: string;
  };
  agent: {
    id: "harmony";
  };
  companyId: string;
  subject: {
    kind: "marketplace_install";
    itemId: string;
    action: "update";
    fromVersion?: string;
    toVersion?: string;
  };
  executionIdentity: {
    executionId: string;
    requestId: string;
    correlationId: string;
  };
}

export interface UpdateMarketplacePolicyInput {
  policyEvidence: MarketplaceUpdatePolicyEvidence;
}

export interface MarketplaceRollbackPolicyEvidence {
  decision: "allow" | "deny";
  approvedAt: string;
  evaluatedAt: string;
  expiresAt?: string;
  actor: {
    type: "founder";
    id: string;
  };
  agent: {
    id: "harmony";
  };
  companyId: string;
  subject: {
    kind: "marketplace_install";
    itemId: string;
    action: "rollback";
    fromVersion?: string;
    toVersion?: string;
  };
  executionIdentity: {
    executionId: string;
    requestId: string;
    correlationId: string;
  };
}

export interface RollbackMarketplacePolicyInput {
  policyEvidence: MarketplaceRollbackPolicyEvidence;
}

export interface MarketplaceUninstallPolicyEvidence {
  decision: "allow" | "deny";
  approvedAt: string;
  evaluatedAt: string;
  expiresAt?: string;
  actor: {
    type: "founder";
    id: string;
  };
  agent: {
    id: "harmony";
  };
  companyId: string;
  subject: {
    kind: "marketplace_install";
    itemId: string;
    action: "uninstall";
    fromVersion?: string;
  };
  executionIdentity: {
    executionId: string;
    requestId: string;
    correlationId: string;
  };
}

export interface UninstallMarketplacePolicyInput {
  policyEvidence: MarketplaceUninstallPolicyEvidence;
}

type PersistInstallEvidenceInput = {
  userId: string;
  companyId: string;
  itemId: string;
  version: string | null;
  policyEvidence: MarketplaceInstallPolicyEvidence;
  decision: "applied" | "blocked";
  reasonCode: string;
};

type PersistUpdateEvidenceInput = {
  userId: string;
  companyId: string;
  itemId: string;
  fromVersion: string | null;
  toVersion: string | null;
  policyEvidence: MarketplaceUpdatePolicyEvidence;
  decision: "applied" | "blocked";
  reasonCode: string;
  note?: string;
};

type PersistRollbackEvidenceInput = {
  userId: string;
  companyId: string;
  itemId: string;
  fromVersion: string | null;
  toVersion: string | null;
  policyEvidence: MarketplaceRollbackPolicyEvidence;
  decision: "applied" | "blocked";
  reasonCode: string;
};

type PersistUninstallEvidenceInput = {
  userId: string;
  companyId: string;
  itemId: string;
  fromVersion: string | null;
  policyEvidence: MarketplaceUninstallPolicyEvidence;
  decision: "applied" | "blocked";
  reasonCode: string;
};

function blockedPlan(action: InstallActionKind, itemId: string, reason: string): InstallPlan {
  return {
    action,
    itemId,
    fromVersion: null,
    toVersion: null,
    steps: [],
    warnings: [],
    blocked: true,
    reasons: [reason],
  };
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateInstallPolicyEvidence(
  userId: string,
  companyId: string,
  itemId: string,
  version: string | undefined,
  input: InstallMarketplacePolicyInput | undefined,
): string | null {
  if (!input || typeof input !== "object") return "missing_policy_decision";
  const evidence = input.policyEvidence;
  if (!evidence || typeof evidence !== "object") return "missing_policy_decision";
  if (evidence.decision !== "allow") return "policy_denied";
  if (!isIsoDate(evidence.approvedAt) || !isIsoDate(evidence.evaluatedAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && !isIsoDate(evidence.expiresAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) < Date.now()) return "stale_policy_evidence";
  if (evidence.actor?.type !== "founder" || evidence.actor.id !== userId) return "policy_subject_mismatch";
  if (evidence.agent?.id !== "harmony") return "policy_subject_mismatch";
  if (evidence.companyId !== companyId) return "policy_subject_mismatch";
  if (evidence.subject?.kind !== "marketplace_install" || evidence.subject.action !== "install") {
    return "policy_subject_mismatch";
  }
  if (evidence.subject.itemId !== itemId) return "policy_subject_mismatch";
  if ((version ?? "") !== (evidence.subject.version ?? "")) return "policy_subject_mismatch";
  const identity = evidence.executionIdentity;
  if (
    !identity ||
    !isNonEmpty(identity.executionId) ||
    !isNonEmpty(identity.requestId) ||
    !isNonEmpty(identity.correlationId)
  ) {
    return "missing_execution_identity";
  }
  return null;
}

function validateUpdatePolicyEvidence(
  userId: string,
  companyId: string,
  itemId: string,
  fromVersion: string | null,
  toVersion: string | null,
  input: UpdateMarketplacePolicyInput | undefined,
): string | null {
  if (!input || typeof input !== "object") return "missing_policy_decision";
  const evidence = input.policyEvidence;
  if (!evidence || typeof evidence !== "object") return "missing_policy_decision";
  if (evidence.decision !== "allow") return "policy_denied";
  if (!isIsoDate(evidence.approvedAt) || !isIsoDate(evidence.evaluatedAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && !isIsoDate(evidence.expiresAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) < Date.now()) return "stale_policy_evidence";
  if (evidence.actor?.type !== "founder" || evidence.actor.id !== userId) return "policy_subject_mismatch";
  if (evidence.agent?.id !== "harmony") return "policy_subject_mismatch";
  if (evidence.companyId !== companyId) return "policy_subject_mismatch";
  if (evidence.subject?.kind !== "marketplace_install" || evidence.subject.action !== "update") {
    return "policy_subject_mismatch";
  }
  if (evidence.subject.itemId !== itemId) return "policy_subject_mismatch";
  const identity = evidence.executionIdentity;
  if (
    !identity ||
    !isNonEmpty(identity.executionId) ||
    !isNonEmpty(identity.requestId) ||
    !isNonEmpty(identity.correlationId)
  ) {
    return "missing_execution_identity";
  }
  return null;
}

function validateUpdatePolicyTransition(
  evidence: MarketplaceUpdatePolicyEvidence,
  fromVersion: string | null,
  toVersion: string | null,
): string | null {
  if ((evidence.subject.fromVersion ?? "") !== (fromVersion ?? "")) return "policy_subject_mismatch";
  if ((evidence.subject.toVersion ?? "") !== (toVersion ?? "")) return "policy_subject_mismatch";
  return null;
}

function validateRollbackPolicyEvidence(
  userId: string,
  companyId: string,
  itemId: string,
  input: RollbackMarketplacePolicyInput | undefined,
): string | null {
  if (!input || typeof input !== "object") return "missing_policy_decision";
  const evidence = input.policyEvidence;
  if (!evidence || typeof evidence !== "object") return "missing_policy_decision";
  if (evidence.decision !== "allow") return "policy_denied";
  if (!isIsoDate(evidence.approvedAt) || !isIsoDate(evidence.evaluatedAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && !isIsoDate(evidence.expiresAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) < Date.now()) return "stale_policy_evidence";
  if (evidence.actor?.type !== "founder" || evidence.actor.id !== userId) return "policy_subject_mismatch";
  if (evidence.agent?.id !== "harmony") return "policy_subject_mismatch";
  if (evidence.companyId !== companyId) return "policy_subject_mismatch";
  if (evidence.subject?.kind !== "marketplace_install" || evidence.subject.action !== "rollback") {
    return "policy_subject_mismatch";
  }
  if (evidence.subject.itemId !== itemId) return "policy_subject_mismatch";
  const identity = evidence.executionIdentity;
  if (
    !identity ||
    !isNonEmpty(identity.executionId) ||
    !isNonEmpty(identity.requestId) ||
    !isNonEmpty(identity.correlationId)
  ) {
    return "missing_execution_identity";
  }
  return null;
}

function validateRollbackPolicyTransition(
  evidence: MarketplaceRollbackPolicyEvidence,
  plannedFromVersion: string | null,
  plannedToVersion: string | null,
): string | null {
  const expectedFrom = evidence.subject.fromVersion ?? null;
  const expectedTo = evidence.subject.toVersion ?? null;
  if ((plannedFromVersion ?? null) !== expectedFrom) return "policy_subject_mismatch";
  if ((plannedToVersion ?? null) !== expectedTo) return "policy_subject_mismatch";
  return null;
}

function validateUninstallPolicyEvidence(
  userId: string,
  companyId: string,
  itemId: string,
  input: UninstallMarketplacePolicyInput | undefined,
): string | null {
  if (!input || typeof input !== "object") return "missing_policy_decision";
  const evidence = input.policyEvidence;
  if (!evidence || typeof evidence !== "object") return "missing_policy_decision";
  if (evidence.decision !== "allow") return "policy_denied";
  if (!isIsoDate(evidence.approvedAt) || !isIsoDate(evidence.evaluatedAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && !isIsoDate(evidence.expiresAt)) return "malformed_policy_evidence";
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) < Date.now()) return "stale_policy_evidence";
  if (evidence.actor?.type !== "founder" || evidence.actor.id !== userId) return "policy_subject_mismatch";
  if (evidence.agent?.id !== "harmony") return "policy_subject_mismatch";
  if (evidence.companyId !== companyId) return "policy_subject_mismatch";
  if (evidence.subject?.kind !== "marketplace_install" || evidence.subject.action !== "uninstall") {
    return "policy_subject_mismatch";
  }
  if (evidence.subject.itemId !== itemId) return "policy_subject_mismatch";
  const identity = evidence.executionIdentity;
  if (
    !identity ||
    !isNonEmpty(identity.executionId) ||
    !isNonEmpty(identity.requestId) ||
    !isNonEmpty(identity.correlationId)
  ) {
    return "missing_execution_identity";
  }
  return null;
}

function validateUninstallPolicyTransition(
  evidence: MarketplaceUninstallPolicyEvidence,
  plannedFromVersion: string | null,
): string | null {
  const expectedFrom = evidence.subject.fromVersion ?? null;
  if (plannedFromVersion !== expectedFrom) return "policy_subject_mismatch";
  return null;
}

async function persistInstallDecisionEvidence(input: PersistInstallEvidenceInput): Promise<string | null> {
  const supabase = await createClient();
  const idempotencyKey = [
    "marketplace_install",
    input.companyId,
    input.itemId,
    input.version ?? "latest",
    input.policyEvidence.executionIdentity.executionId,
    input.policyEvidence.executionIdentity.requestId,
    input.policyEvidence.executionIdentity.correlationId,
    input.decision,
    input.reasonCode,
  ].join(":");

  const payload = {
    operation: "marketplace_install",
    decision: input.decision,
    reasonCode: input.reasonCode,
    actor: {
      type: input.policyEvidence.actor.type,
      id: input.policyEvidence.actor.id,
    },
    companyId: input.companyId,
    itemId: input.itemId,
    version: input.version,
    executionIdentity: input.policyEvidence.executionIdentity,
    policyEvidence: input.policyEvidence,
    decidedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("agent_autonomy_audit")
    .upsert(
      {
        user_id: input.userId,
        company_id: input.companyId,
        agent_id: "harmony",
        action: "marketplace_install",
        target_type: "marketplace_item",
        target_id: input.itemId,
        status: input.decision,
        reason_code: input.reasonCode,
        idempotency_key: idempotencyKey,
        payload,
      },
      { onConflict: "idempotency_key" },
    )
    .select("id")
    .maybeSingle();

  if (error) return null;
  return (data as { id?: string } | null)?.id ?? null;
}

async function persistUpdateDecisionEvidence(input: PersistUpdateEvidenceInput): Promise<string | null> {
  const supabase = await createClient();
  const idempotencyKey = [
    "marketplace_update",
    input.companyId,
    input.itemId,
    input.fromVersion ?? "none",
    input.toVersion ?? "none",
    input.policyEvidence.executionIdentity.executionId,
    input.policyEvidence.executionIdentity.requestId,
    input.policyEvidence.executionIdentity.correlationId,
    input.decision,
    input.reasonCode,
  ].join(":");

  const payload = {
    operation: "marketplace_update",
    decision: input.decision,
    reasonCode: input.reasonCode,
    actor: {
      type: input.policyEvidence.actor.type,
      id: input.policyEvidence.actor.id,
    },
    companyId: input.companyId,
    itemId: input.itemId,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    executionIdentity: input.policyEvidence.executionIdentity,
    policyEvidence: input.policyEvidence,
    note: input.note ?? "m3a_non_atomic_update_evidence",
  };

  const { data, error } = await supabase
    .from("agent_autonomy_audit")
    .upsert(
      {
        operation: "marketplace_update",
        decision: input.decision,
        reason: input.reasonCode,
        actor_user_id: input.userId,
        company_id: input.companyId,
        policy_key: idempotencyKey,
        payload,
      },
      { onConflict: "operation,policy_key" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[marketplace] update audit evidence persist", error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

async function persistRollbackDecisionEvidence(input: PersistRollbackEvidenceInput): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_autonomy_audit")
    .upsert(
      {
        user_id: input.userId,
        company_id: input.companyId,
        agent_id: input.policyEvidence.agent.id,
        actor_type: input.policyEvidence.actor.type,
        actor_id: input.policyEvidence.actor.id,
        decision: input.decision,
        confidence: 1,
        reason: input.reasonCode,
        metadata: {
          action: "marketplace.rollback",
          itemId: input.itemId,
          fromVersion: input.fromVersion,
          toVersion: input.toVersion,
          policy: {
            approvedAt: input.policyEvidence.approvedAt,
            evaluatedAt: input.policyEvidence.evaluatedAt,
            expiresAt: input.policyEvidence.expiresAt ?? null,
            executionIdentity: input.policyEvidence.executionIdentity,
          },
        },
      },
      {
        onConflict: "user_id,company_id,agent_id,actor_type,actor_id,decision,reason",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .maybeSingle();

  if (error) return null;
  return data?.id ?? null;
}

async function persistUninstallDecisionEvidence(input: PersistUninstallEvidenceInput): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_autonomy_audit")
    .upsert(
      {
        user_id: input.userId,
        company_id: input.companyId,
        agent_id: input.policyEvidence.agent.id,
        actor_type: input.policyEvidence.actor.type,
        actor_id: input.policyEvidence.actor.id,
        decision: input.decision,
        confidence: 1,
        reason: input.reasonCode,
        metadata: {
          action: "marketplace.uninstall",
          itemId: input.itemId,
          fromVersion: input.fromVersion,
          policy: {
            approvedAt: input.policyEvidence.approvedAt,
            evaluatedAt: input.policyEvidence.evaluatedAt,
            expiresAt: input.policyEvidence.expiresAt ?? null,
            executionIdentity: input.policyEvidence.executionIdentity,
          },
        },
      },
      {
        onConflict: "user_id,company_id,agent_id,actor_type,actor_id,decision,reason",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .maybeSingle();

  if (error) return null;
  return data?.id ?? null;
}

async function ownsCompany(userId: string, companyId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Upsert the plan's steps as installation rows (install / update / rollback). */
function buildInstallRows(
  userId: string,
  companyId: string,
  catalog: Catalog,
  plan: InstallPlan,
): Array<Record<string, unknown>> {
  const now = new Date().toISOString();
  return plan.steps.map((s) => ({
    user_id: userId,
    company_id: companyId,
    item_id: s.itemId,
    kind: s.kind,
    installed_version: s.version,
    source: catalog[s.itemId]?.visibility ?? "marketplace_public",
    enabled: true,
    updated_at: now,
  }));
}

async function applyInstallAtomically(
  userId: string,
  companyId: string,
  itemId: string,
  version: string | null,
  policyEvidence: MarketplaceInstallPolicyEvidence,
  rows: Array<Record<string, unknown>>,
  reasonCode: string,
): Promise<{ applied: boolean; evidenceId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_apply_install_with_evidence", {
    p_company_id: companyId,
    p_item_id: itemId,
    p_rows: rows,
    p_policy_evidence: policyEvidence,
    p_evidence_version: version,
    p_evidence_execution_id: policyEvidence.executionIdentity.executionId,
    p_evidence_request_id: policyEvidence.executionIdentity.requestId,
    p_evidence_correlation_id: policyEvidence.executionIdentity.correlationId,
    p_reason_code: reasonCode,
  });

  if (error) return { applied: false, error: error.message };

  const first = Array.isArray(data) ? data[0] : data;
  const evidenceId =
    first && typeof first === "object" && "evidence_id" in first
      ? String((first as { evidence_id?: string | null }).evidence_id ?? "")
      : "";

  return { applied: true, evidenceId: evidenceId || undefined };
}

async function applyUpdateAtomically(
  userId: string,
  companyId: string,
  itemId: string,
  fromVersion: string | null,
  toVersion: string | null,
  policyEvidence: MarketplaceUpdatePolicyEvidence,
  rows: Array<Record<string, unknown>>,
  reasonCode: string,
): Promise<{ applied: boolean; evidenceId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_apply_update_with_evidence", {
    p_company_id: companyId,
    p_item_id: itemId,
    p_rows: rows,
    p_policy_evidence: policyEvidence,
    p_evidence_from_version: fromVersion,
    p_evidence_to_version: toVersion,
    p_evidence_execution_id: policyEvidence.executionIdentity.executionId,
    p_evidence_request_id: policyEvidence.executionIdentity.requestId,
    p_evidence_correlation_id: policyEvidence.executionIdentity.correlationId,
    p_reason_code: reasonCode,
  });

  if (error) return { applied: false, error: error.message };

  const first = Array.isArray(data) ? data[0] : data;
  const evidenceId =
    first && typeof first === "object" && "evidence_id" in first
      ? String((first as { evidence_id?: string | null }).evidence_id ?? "")
      : "";

  return { applied: true, evidenceId: evidenceId || undefined };
}

async function applyRollbackAtomically(
  companyId: string,
  itemId: string,
  fromVersion: string | null,
  toVersion: string | null,
  policyEvidence: MarketplaceRollbackPolicyEvidence,
): Promise<{ applied: boolean; evidenceId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_apply_rollback_with_evidence", {
    p_company_id: companyId,
    p_item_id: itemId,
    p_to_version: toVersion,
    p_policy_evidence: policyEvidence,
    p_evidence_from_version: fromVersion,
    p_evidence_to_version: toVersion,
    p_evidence_execution_id: policyEvidence.executionIdentity.executionId,
    p_evidence_request_id: policyEvidence.executionIdentity.requestId,
    p_evidence_correlation_id: policyEvidence.executionIdentity.correlationId,
    p_reason_code: "rollback_applied",
  });

  if (error) return { applied: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.applied !== true) {
    return { applied: false, error: "atomic rollback did not apply" };
  }

  return {
    applied: true,
    evidenceId: typeof row.evidence_id === "string" ? row.evidence_id : undefined,
  };
}

async function applyUninstallAtomically(
  companyId: string,
  itemId: string,
  fromVersion: string | null,
  policyEvidence: MarketplaceUninstallPolicyEvidence,
): Promise<{ applied: boolean; evidenceId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("marketplace_apply_uninstall_with_evidence", {
    p_company_id: companyId,
    p_item_id: itemId,
    p_policy_evidence: policyEvidence,
    p_evidence_from_version: fromVersion,
    p_evidence_execution_id: policyEvidence.executionIdentity.executionId,
    p_evidence_request_id: policyEvidence.executionIdentity.requestId,
    p_evidence_correlation_id: policyEvidence.executionIdentity.correlationId,
    p_reason_code: "uninstall_applied",
  });

  if (error) return { applied: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.applied !== true) {
    return { applied: false, error: "atomic uninstall did not apply" };
  }

  return {
    applied: true,
    evidenceId: typeof row.evidence_id === "string" ? row.evidence_id : undefined,
  };
}

async function applySteps(
  userId: string,
  companyId: string,
  catalog: Catalog,
  plan: InstallPlan,
): Promise<ApplyResult> {
  if (plan.steps.length === 0) return { plan, applied: true };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const rows = plan.steps.map((s) => ({
    user_id: userId,
    company_id: companyId,
    item_id: s.itemId,
    kind: s.kind,
    installed_version: s.version,
    source: catalog[s.itemId]?.visibility ?? "marketplace_public",
    enabled: true,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("company_installations")
    .upsert(rows, { onConflict: "company_id,item_id" });

  if (error) return { plan, applied: false, error: error.message };
  return { plan, applied: true };
}

export async function installMarketplaceItem(
  companyId: string,
  itemId: string,
  version?: string,
  policyInput?: InstallMarketplacePolicyInput,
): Promise<ApplyResult> {
  const user = await requireUser();
  const policyError = validateInstallPolicyEvidence(user.id, companyId, itemId, version, policyInput);
  if (policyError) {
    const plan = blockedPlan("install", itemId, "Install blocked by policy validation");
    const evidenceId = policyInput
      ? await persistInstallDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          version: version ?? null,
          policyEvidence: policyInput.policyEvidence,
          decision: "blocked",
          reasonCode: policyError,
        })
      : null;
    return {
      plan,
      applied: false,
      decision: "blocked",
      reasonCode: policyError,
      evidenceId: evidenceId ?? undefined,
      error: policyError,
    };
  }

  const policyEvidence = policyInput?.policyEvidence;
  if (!policyEvidence) {
    return {
      plan: blockedPlan("install", itemId, "Install blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode: "missing_policy_decision",
      error: "missing_policy_decision",
    };
  }

  if (!(await ownsCompany(user.id, companyId))) {
    const evidenceId = await persistInstallDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      version: version ?? null,
      policyEvidence,
      decision: "blocked",
      reasonCode: "forbidden",
    });
    return {
      plan: blockedPlan("install", itemId, "Company not found or not owned"),
      applied: false,
      decision: "blocked",
      reasonCode: "forbidden",
      evidenceId: evidenceId ?? undefined,
      error: "forbidden",
    };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planInstall(catalog, state, itemId, version ? { version } : {});
  if (plan.blocked) {
    const reasonCode = "install_plan_blocked";
    const evidenceId = await persistInstallDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      version: version ?? null,
      policyEvidence,
      decision: "blocked",
      reasonCode,
    });
    return { plan, applied: false, decision: "blocked", reasonCode, evidenceId: evidenceId ?? undefined };
  }
  const rows = buildInstallRows(user.id, companyId, catalog, plan);
  const applied = await applyInstallAtomically(
    user.id,
    companyId,
    itemId,
    version ?? plan.toVersion ?? null,
    policyEvidence,
    rows,
    "install_applied",
  );

  if (!applied.applied) {
    return {
      plan,
      applied: false,
      error: applied.error,
      decision: "blocked",
      reasonCode: "persistence_failed",
      evidenceId:
        (await persistInstallDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          version: version ?? null,
          policyEvidence,
          decision: "blocked",
          reasonCode: "persistence_failed",
        })) ?? undefined,
    };
  }

  return {
    plan,
    applied: true,
    decision: "applied",
    reasonCode: "install_applied",
    evidenceId: applied.evidenceId,
  };
}

export async function updateMarketplaceItem(
  companyId: string,
  itemId: string,
  policyInput?: UpdateMarketplacePolicyInput,
): Promise<ApplyResult> {
  const user = await requireUser();
  const policyError = validateUpdatePolicyEvidence(user.id, companyId, itemId, null, null, policyInput);
  if (policyError) {
    const plan = blockedPlan("update", itemId, "Update blocked by policy validation");
    const evidenceId = policyInput
      ? await persistUpdateDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          fromVersion: null,
          toVersion: null,
          policyEvidence: policyInput.policyEvidence,
          decision: "blocked",
          reasonCode: policyError,
        })
      : null;
    return {
      plan,
      applied: false,
      decision: "blocked",
      reasonCode: policyError,
      evidenceId: evidenceId ?? undefined,
      error: policyError,
    };
  }

  const policyEvidence = policyInput?.policyEvidence;
  if (!policyEvidence) {
    return {
      plan: blockedPlan("update", itemId, "Update blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode: "missing_policy_decision",
      error: "missing_policy_decision",
    };
  }

  if (!(await ownsCompany(user.id, companyId))) {
    const evidenceId = await persistUpdateDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: null,
      toVersion: null,
      policyEvidence,
      decision: "blocked",
      reasonCode: "forbidden",
    });
    return {
      plan: blockedPlan("update", itemId, "Company not found or not owned"),
      applied: false,
      decision: "blocked",
      reasonCode: "forbidden",
      evidenceId: evidenceId ?? undefined,
      error: "forbidden",
    };
  }

  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planUpdate(catalog, state, itemId);
  if (plan.blocked) {
    const reasonCode = "update_plan_blocked";
    const evidenceId = await persistUpdateDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      policyEvidence,
      decision: "blocked",
      reasonCode,
    });
    return { plan, applied: false, decision: "blocked", reasonCode, evidenceId: evidenceId ?? undefined };
  }

  const transitionError = validateUpdatePolicyTransition(policyEvidence, plan.fromVersion, plan.toVersion);
  if (transitionError) {
    const reasonCode = "policy_subject_mismatch";
    const evidenceId = await persistUpdateDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      policyEvidence,
      decision: "blocked",
      reasonCode,
      note: "update_transition_conflict",
    });
    return {
      plan: blockedPlan("update", itemId, "Update blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode,
      evidenceId: evidenceId ?? undefined,
      error: reasonCode,
    };
  }

  const rows = buildInstallRows(user.id, companyId, catalog, plan);
  const applied = await applyUpdateAtomically(
    user.id,
    companyId,
    itemId,
    plan.fromVersion,
    plan.toVersion,
    policyEvidence,
    rows,
    "update_applied",
  );

  if (!applied.applied) {
    return {
      plan,
      applied: false,
      error: applied.error,
      decision: "blocked",
      reasonCode: "persistence_failed",
      evidenceId:
        (await persistUpdateDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          fromVersion: plan.fromVersion,
          toVersion: plan.toVersion,
          policyEvidence,
          decision: "blocked",
          reasonCode: "persistence_failed",
        })) ?? undefined,
    };
  }

  return {
    plan,
    applied: true,
    decision: "applied",
    reasonCode: "update_applied",
    evidenceId: applied.evidenceId,
  };
}

export async function rollbackMarketplaceItem(
  companyId: string,
  itemId: string,
  toVersion: string,
  policyInput?: RollbackMarketplacePolicyInput,
): Promise<ApplyResult> {
  const user = await requireUser();

  const policyError = validateRollbackPolicyEvidence(user.id, companyId, itemId, policyInput);
  if (policyError) {
    const plan = blockedPlan("rollback", itemId, "Rollback blocked by policy validation");
    const evidenceId = policyInput?.policyEvidence
      ? await persistRollbackDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          fromVersion: null,
          toVersion: null,
          policyEvidence: policyInput.policyEvidence,
          decision: "blocked",
          reasonCode: policyError,
        })
      : null;
    return {
      plan,
      applied: false,
      decision: "blocked",
      reasonCode: policyError,
      evidenceId: evidenceId ?? undefined,
      error: policyError,
    };
  }

  const policyEvidence = policyInput?.policyEvidence;
  if (!policyEvidence) {
    return {
      plan: blockedPlan("rollback", itemId, "Rollback blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode: "missing_policy_decision",
      error: "missing_policy_decision",
    };
  }

  if (!(await ownsCompany(user.id, companyId))) {
    const evidenceId = await persistRollbackDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: null,
      toVersion: null,
      policyEvidence,
      decision: "blocked",
      reasonCode: "forbidden",
    });
    return {
      plan: blockedPlan("rollback", itemId, "Company not found or not owned"),
      applied: false,
      decision: "blocked",
      reasonCode: "forbidden",
      evidenceId: evidenceId ?? undefined,
      error: "forbidden",
    };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planRollback(catalog, state, itemId, toVersion);
  if (plan.blocked) {
    const reasonCode = "rollback_plan_blocked";
    const evidenceId = await persistRollbackDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      policyEvidence,
      decision: "blocked",
      reasonCode,
    });
    return { plan, applied: false, decision: "blocked", reasonCode, evidenceId: evidenceId ?? undefined };
  }

  const transitionError = validateRollbackPolicyTransition(policyEvidence, plan.fromVersion, plan.toVersion);
  if (transitionError) {
    const reasonCode = "policy_subject_mismatch";
    const evidenceId = await persistRollbackDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      policyEvidence,
      decision: "blocked",
      reasonCode,
    });
    return {
      plan: blockedPlan("rollback", itemId, "Rollback blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode,
      evidenceId: evidenceId ?? undefined,
      error: reasonCode,
    };
  }

  const applied = await applyRollbackAtomically(companyId, itemId, plan.fromVersion, plan.toVersion, policyEvidence);
  if (!applied.applied) {
    return {
      plan,
      applied: false,
      error: applied.error,
      decision: "blocked",
      reasonCode: "persistence_failed",
      evidenceId:
        (await persistRollbackDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          fromVersion: plan.fromVersion,
          toVersion: plan.toVersion,
          policyEvidence,
          decision: "blocked",
          reasonCode: "persistence_failed",
        })) ?? undefined,
    };
  }

  return {
    plan,
    applied: true,
    decision: "applied",
    reasonCode: "rollback_applied",
    evidenceId: applied.evidenceId,
  };
}

export async function uninstallMarketplaceItem(
  companyId: string,
  itemId: string,
  policyInput?: UninstallMarketplacePolicyInput,
): Promise<ApplyResult> {
  const user = await requireUser();

  const policyError = validateUninstallPolicyEvidence(user.id, companyId, itemId, policyInput);
  if (policyError) {
    const plan = blockedPlan("uninstall", itemId, "Uninstall blocked by policy validation");
    const evidenceId = policyInput?.policyEvidence
      ? await persistUninstallDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          fromVersion: null,
          policyEvidence: policyInput.policyEvidence,
          decision: "blocked",
          reasonCode: policyError,
        })
      : null;
    return {
      plan,
      applied: false,
      decision: "blocked",
      reasonCode: policyError,
      evidenceId: evidenceId ?? undefined,
      error: policyError,
    };
  }

  const policyEvidence = policyInput?.policyEvidence;
  if (!policyEvidence) {
    return {
      plan: blockedPlan("uninstall", itemId, "Uninstall blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode: "missing_policy_decision",
      error: "missing_policy_decision",
    };
  }

  if (!(await ownsCompany(user.id, companyId))) {
    const evidenceId = await persistUninstallDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: null,
      policyEvidence,
      decision: "blocked",
      reasonCode: "forbidden",
    });
    return {
      plan: blockedPlan("uninstall", itemId, "Company not found or not owned"),
      applied: false,
      decision: "blocked",
      reasonCode: "forbidden",
      evidenceId: evidenceId ?? undefined,
      error: "forbidden",
    };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planUninstall(catalog, state, itemId);
  if (plan.blocked) {
    const reasonCode = "uninstall_plan_blocked";
    const evidenceId = await persistUninstallDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: plan.fromVersion,
      policyEvidence,
      decision: "blocked",
      reasonCode,
    });
    return { plan, applied: false, decision: "blocked", reasonCode, evidenceId: evidenceId ?? undefined };
  }

  const transitionError = validateUninstallPolicyTransition(policyEvidence, plan.fromVersion);
  if (transitionError) {
    const reasonCode = "policy_subject_mismatch";
    const evidenceId = await persistUninstallDecisionEvidence({
      userId: user.id,
      companyId,
      itemId,
      fromVersion: plan.fromVersion,
      policyEvidence,
      decision: "blocked",
      reasonCode,
    });
    return {
      plan: blockedPlan("uninstall", itemId, "Uninstall blocked by policy validation"),
      applied: false,
      decision: "blocked",
      reasonCode,
      evidenceId: evidenceId ?? undefined,
      error: reasonCode,
    };
  }

  const applied = await applyUninstallAtomically(companyId, itemId, plan.fromVersion, policyEvidence);
  if (!applied.applied) {
    return {
      plan,
      applied: false,
      error: applied.error,
      decision: "blocked",
      reasonCode: "persistence_failed",
      evidenceId:
        (await persistUninstallDecisionEvidence({
          userId: user.id,
          companyId,
          itemId,
          fromVersion: plan.fromVersion,
          policyEvidence,
          decision: "blocked",
          reasonCode: "persistence_failed",
        })) ?? undefined,
    };
  }

  return {
    plan,
    applied: true,
    decision: "applied",
    reasonCode: "uninstall_applied",
    evidenceId: applied.evidenceId,
  };
}
