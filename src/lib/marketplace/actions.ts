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

type PersistInstallEvidenceInput = {
  userId: string;
  companyId: string;
  itemId: string;
  version: string | null;
  policyEvidence: MarketplaceInstallPolicyEvidence;
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

export async function updateMarketplaceItem(companyId: string, itemId: string): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("update", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planUpdate(catalog, state, itemId);
  if (plan.blocked) return { plan, applied: false };
  return applySteps(user.id, companyId, catalog, plan);
}

export async function rollbackMarketplaceItem(
  companyId: string,
  itemId: string,
  toVersion: string,
): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("rollback", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planRollback(catalog, state, itemId, toVersion);
  if (plan.blocked) return { plan, applied: false };
  return applySteps(user.id, companyId, catalog, plan);
}

export async function uninstallMarketplaceItem(companyId: string, itemId: string): Promise<ApplyResult> {
  const user = await requireUser();
  if (!(await ownsCompany(user.id, companyId))) {
    return { plan: blockedPlan("uninstall", itemId, "Company not found or not owned"), applied: false, error: "forbidden" };
  }
  const [catalog, state] = await Promise.all([loadCatalog(), loadInstallState(user.id, companyId)]);
  const plan = planUninstall(catalog, state, itemId);
  if (plan.blocked) return { plan, applied: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_installations")
    .delete()
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("item_id", itemId);
  if (error) return { plan, applied: false, error: error.message };
  return { plan, applied: true };
}
