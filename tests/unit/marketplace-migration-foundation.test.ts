import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const foundationPath = "supabase/migrations/20260705090000_marketplace_persistence_foundation.sql";
const forwardPath = "supabase/migrations/20260723100000_reconcile_marketplace_persistence.sql";
const foundation = readFileSync(foundationPath, "utf8");
const forward = readFileSync(forwardPath, "utf8");
const persistence = readFileSync("src/lib/marketplace/persistence.ts", "utf8");
const actions = readFileSync("src/lib/marketplace/actions.ts", "utf8");
const publish = readFileSync("src/lib/marketplace/publish-actions.ts", "utf8");
const reviews = readFileSync("src/lib/marketplace/review-actions.ts", "utf8");
const certification = readFileSync("scripts/ci/full-migration-chain-certification.mjs", "utf8");
const workflow = readFileSync(".github/workflows/full-migration-chain-certification.yml", "utf8");
const rollbackAtomic = readFileSync("supabase/migrations/20260807190000_marketplace_atomic_rollback_evidence.sql", "utf8");
const uninstallAtomic = readFileSync("supabase/migrations/20260807200000_marketplace_atomic_uninstall_evidence.sql", "utf8");
const decisionReconciliation = readFileSync(
  "supabase/migrations/20260807220000_marketplace_audit_decision_contract_reconciliation.sql",
  "utf8",
);
const indexReconciliation = readFileSync(
  "supabase/migrations/20260807230000_marketplace_audit_idempotency_index_reconciliation.sql",
  "utf8",
);
const boundaryEnforcement = readFileSync(
  "supabase/migrations/20260807240000_marketplace_rollback_uninstall_boundary_enforcement.sql",
  "utf8",
);
const promotionApprovalEvidence = readFileSync(
  "supabase/migrations/20260807250000_production_promotion_approval_evidence.sql",
  "utf8",
);
const promotionPreviewWaiver = readFileSync(
  "supabase/migrations/20260814010000_production_promotion_preview_waiver.sql",
  "utf8",
);

describe("marketplace migration foundation", () => {
  it("sorts the clean-database foundation before every dependent migration", () => {
    expect("20260705090000_marketplace_persistence_foundation.sql"
      < "20260705100000_grant_authenticated_select_broken_rls_read_paths.sql").toBe(true);
    expect("20260705090000_marketplace_persistence_foundation.sql"
      < "20260705120000_grant_authenticated_dml_marketplace_write_paths.sql").toBe(true);
    expect("20260705090000_marketplace_persistence_foundation.sql"
      < "20260705130000_marketplace_items_add_license.sql").toBe(true);
  });

  it("creates every live marketplace object used by the application", () => {
    for (const table of [
      "marketplace_items",
      "marketplace_item_versions",
      "marketplace_item_ratings",
      "company_installations",
    ]) {
      expect(foundation).toContain(`create table if not exists public.${table}`);
      expect(forward).toContain(`create table if not exists public.${table}`);
    }
    expect(foundation).toContain("function public.marketplace_install_counts()");
    expect(forward).toContain("function public.marketplace_install_counts()");
  });

  it("matches the marketplace persistence and write contracts", () => {
    expect(persistence).toContain('.from("marketplace_items")');
    expect(persistence).toContain('.from("marketplace_item_versions")');
    expect(persistence).toContain('.from("marketplace_item_ratings")');
    expect(persistence).toContain('.from("company_installations")');
    expect(persistence).toContain('.rpc("marketplace_install_counts")');
    expect(actions).toContain('{ onConflict: "company_id,item_id" }');
    expect(publish).toContain("visibility: \"company_private\"");
    expect(publish).toContain("verification: \"unverified\"");
    expect(reviews).toContain('.from("marketplace_item_ratings")');
    expect(foundation).toContain("unique (company_id, item_id)");
    expect(foundation).toContain("unique (item_id, user_id)");
  });

  it("preserves owner isolation and privileged public publishing", () => {
    expect(forward).toContain('create policy "select_own_or_public_verified"');
    expect(forward).toContain('create policy "owner_insert_private"');
    expect(forward).toContain("visibility='company_private' and verification='unverified'");
    expect(forward).toContain('create policy "rater_insert"');
    expect(forward).toContain('create policy "owner_insert" on public.company_installations');
    expect(forward).toContain("c.user_id=auth.uid()");
    expect(forward).toContain("to authenticated, service_role");
    expect(forward).toContain("revoke all privileges on table public.marketplace_items from anon");
  });

  it("is additive and fails closed instead of deleting marketplace data", () => {
    expect(forward).toContain("marketplace_duplicate_slugs");
    expect(forward).toContain("marketplace_version_owner_mismatch");
    expect(forward).toContain("marketplace_installation_company_owner_mismatch");
    expect(forward).not.toMatch(/drop\s+(table|column)|truncate|delete\s+from/i);
  });

  it("certifies complete migration history with current marketplace chain size", () => {
    expect(certification).toContain("migrations.length !== 59");
    expect(certification).toContain("migration_failed:${basename(path)}");
    expect(certification).toContain("non_local_postgres_rejected");
    expect(certification).toContain("persistent_database_environment_rejected");
    expect(workflow).toContain("pgvector/pgvector:pg15");
    expect(workflow).toContain("node-version: 22");
    expect(workflow).not.toMatch(/supabase\s+(?:link|db push)|vercel|service[_-]role[_-]key/i);
  });

  it("certifies atomic rollback RPC governance and privilege contract", () => {
    expect(rollbackAtomic).toContain("create or replace function public.marketplace_apply_rollback_with_evidence(");
    expect(rollbackAtomic).toContain("security definer");
    expect(rollbackAtomic).toContain("v_user_id := auth.uid()");
    expect(rollbackAtomic).toContain("raise exception 'unauthenticated'");
    expect(rollbackAtomic).toContain("forbidden_company");
    expect(rollbackAtomic).toContain("policy_actor_mismatch");
    expect(rollbackAtomic).toContain("policy_company_mismatch");
    expect(rollbackAtomic).toContain("policy_item_mismatch");
    expect(rollbackAtomic).toContain("policy_action_mismatch");
    expect(rollbackAtomic).toContain("rollback_transition_conflict");
    expect(rollbackAtomic).toContain("rollback_target_mismatch");
    expect(rollbackAtomic).toContain("update public.company_installations");
    expect(rollbackAtomic).toContain("insert into public.agent_autonomy_audit");
    expect(rollbackAtomic).toContain("p_reason_code text default 'rollback_applied'");
    expect(rollbackAtomic).toContain(") from public, anon;");
    expect(rollbackAtomic).toContain(") to authenticated, service_role;");
  });

  it("certifies atomic uninstall RPC governance and privilege contract", () => {
    expect(uninstallAtomic).toContain("create or replace function public.marketplace_apply_uninstall_with_evidence(");
    expect(uninstallAtomic).toContain("security definer");
    expect(uninstallAtomic).toContain("v_user_id := auth.uid()");
    expect(uninstallAtomic).toContain("raise exception 'unauthenticated'");
    expect(uninstallAtomic).toContain("forbidden_company");
    expect(uninstallAtomic).toContain("policy_actor_mismatch");
    expect(uninstallAtomic).toContain("policy_company_mismatch");
    expect(uninstallAtomic).toContain("policy_item_mismatch");
    expect(uninstallAtomic).toContain("policy_action_mismatch");
    expect(uninstallAtomic).toContain("uninstall_transition_conflict");
    expect(uninstallAtomic).toContain("delete from public.company_installations");
    expect(uninstallAtomic).toContain("insert into public.agent_autonomy_audit");
    expect(uninstallAtomic).toContain("p_reason_code text default 'uninstall_applied'");
    expect(uninstallAtomic).toContain(") from public, anon;");
    expect(uninstallAtomic).toContain(") to authenticated, service_role;");
  });

  it("certifies additive audit evidence reconciliation for marketplace contracts", () => {
    const auditReconciliation = readFileSync(
      "supabase/migrations/20260807210000_marketplace_audit_evidence_contract_reconciliation.sql",
      "utf8",
    );
    expect(auditReconciliation).toContain("add column if not exists operation text");
    expect(auditReconciliation).toContain("add column if not exists policy_key text");
    expect(auditReconciliation).toContain("add column if not exists payload jsonb");
    expect(auditReconciliation).toContain("add column if not exists idempotency_key text");
    expect(auditReconciliation).toContain("agent_autonomy_audit_operation_policy_key_uq");
    expect(auditReconciliation).toContain("agent_autonomy_audit_idempotency_key_uq");
  });

  it("certifies additive audit decision-contract reconciliation for marketplace outcomes", () => {
    expect(decisionReconciliation).toContain("drop constraint if exists agent_autonomy_audit_decision_check");
    expect(decisionReconciliation).toContain("add constraint agent_autonomy_audit_decision_check");
    expect(decisionReconciliation).toContain("'applied'");
    expect(decisionReconciliation).toContain("'blocked'");
    expect(decisionReconciliation).toContain("'auto_executed'");
    expect(decisionReconciliation).toContain("'lockdown'");
  });

  it("runs executable marketplace audit evidence probes in full migration certification", () => {
    expect(certification).toContain("function assertMarketplaceAuditEvidenceContract(database)");
    expect(certification).toContain("marketplace_audit_duplicate_not_idempotent");
    expect(certification).toContain("marketplace_audit_legacy_required_fields_missing");
    expect(certification).toContain("marketplace_audit_invalid_decision_was_allowed");
    expect(certification).toContain("invalid_decision");
  });

  it("certifies canonical non-partial idempotency index arbiters for marketplace evidence upserts", () => {
    expect(indexReconciliation).toContain("drop index if exists public.agent_autonomy_audit_operation_policy_key_uq;");
    expect(indexReconciliation).toContain("create unique index if not exists agent_autonomy_audit_operation_policy_key_uq");
    expect(indexReconciliation).toContain("on public.agent_autonomy_audit (operation, policy_key);");
    expect(indexReconciliation).toContain("drop index if exists public.agent_autonomy_audit_idempotency_key_uq;");
    expect(indexReconciliation).toContain("create unique index if not exists agent_autonomy_audit_idempotency_key_uq");
    expect(indexReconciliation).toContain("on public.agent_autonomy_audit (idempotency_key);");
    expect(indexReconciliation).not.toMatch(/where\s+operation\s+is\s+not\s+null/i);
    expect(indexReconciliation).not.toMatch(/where\s+idempotency_key\s+is\s+not\s+null/i);
  });

  it("certifies rollback/uninstall database boundary enforcement migration", () => {
    expect(boundaryEnforcement).toContain("create or replace function public.marketplace_apply_rollback_with_evidence(");
    expect(boundaryEnforcement).toContain("create or replace function public.marketplace_apply_uninstall_with_evidence(");
    expect(boundaryEnforcement).toContain("create or replace function public.marketplace_semver_compare(");
    expect(boundaryEnforcement).toContain("create or replace function public.marketplace_semver_satisfies(");
    expect(boundaryEnforcement).toContain("create or replace function public.marketplace_timestamptz_is_valid(");
    expect(boundaryEnforcement).toContain("or not public.marketplace_semver_satisfies(dep_ci.installed_version, dep->>'range')");
    expect(boundaryEnforcement).toContain("if not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'approvedAt')");
    expect(boundaryEnforcement).toContain("or not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'evaluatedAt')");
    expect(boundaryEnforcement).toContain("if not public.marketplace_timestamptz_is_valid(p_policy_evidence->>'expiresAt') then");
    expect(boundaryEnforcement).toContain("policy_denied");
    expect(boundaryEnforcement).toContain("execution_identity_mismatch");
    expect(boundaryEnforcement).toContain("rollback_target_not_older");
    expect(boundaryEnforcement).toContain("uninstall_dependency_conflict");
  });

  it("runs executable rollback/uninstall database boundary probes in certification", () => {
    expect(certification).toContain("function assertMarketplaceBoundaryEnforcement(database)");
    expect(certification).toContain("semver_build_metadata_precedence_failed");
    expect(certification).toContain("rollback_ranged_dependency_compatible_failed");
    expect(certification).toContain("rollback_ranged_dependency_incompatible_not_rejected");
    expect(certification).toContain("rollback_malformed_approved_at_not_rejected");
    expect(certification).toContain("uninstall_malformed_approved_at_not_rejected");
    expect(certification).toContain("rollback_timestamp_rejection_mutated_state");
    expect(certification).toContain("uninstall_timestamp_rejection_mutated_state");
    expect(certification).toContain("rollback_same_should_fail");
    expect(certification).toContain("rollback_newer_should_fail");
    expect(certification).toContain("rollback_nonexistent_should_fail");
    expect(certification).toContain("uninstall_with_dependents_should_fail");
  });



  it("certifies production-promotion preview waiver persistence contract", () => {
    expect(promotionPreviewWaiver).toContain("add column if not exists preview_certification_waiver boolean not null default false");
    expect(promotionPreviewWaiver).toContain("add column if not exists preview_certification_waiver_reason text null");
    expect(promotionPreviewWaiver).toContain("alter column runtime_evidence_id drop not null");
    expect(promotionPreviewWaiver).toContain("alter column runtime_artifact_id drop not null");
    expect(promotionPreviewWaiver).toContain("production_promotion_requests_preview_waiver_semantics_check");
    expect(promotionPreviewWaiver).toContain("preview_certification_waiver = false");
    expect(promotionPreviewWaiver).toContain("runtime_evidence_id is not null");
    expect(promotionPreviewWaiver).toContain("runtime_artifact_id is not null");
    expect(promotionPreviewWaiver).toContain("preview_certification_waiver_reason is null");
    expect(promotionPreviewWaiver).toContain("preview_certification_waiver = true");
    expect(promotionPreviewWaiver).toContain("runtime_evidence_id is null");
    expect(promotionPreviewWaiver).toContain("runtime_artifact_id is null");
    expect(promotionPreviewWaiver).toContain("preview_certification_waiver_reason = 'preview_certification_contract_incompatibility'");
    expect(promotionApprovalEvidence).toContain("migration_evidence_id text not null");
    expect(promotionApprovalEvidence).toContain("migration_artifact_id text not null");
    expect(promotionApprovalEvidence).toContain("production_promotion_requests_migration_evidence_id_check");
    expect(promotionApprovalEvidence).toContain("production_promotion_requests_migration_artifact_id_check");
    expect(promotionPreviewWaiver).not.toContain("drop constraint if exists production_promotion_requests_migration_evidence_id_check");
    expect(promotionPreviewWaiver).not.toContain("drop constraint if exists production_promotion_requests_migration_artifact_id_check");
    expect(promotionPreviewWaiver).not.toContain("alter column migration_evidence_id drop not null");
    expect(promotionPreviewWaiver).not.toContain("alter column migration_artifact_id drop not null");
    expect(promotionPreviewWaiver).toContain("drop constraint if exists production_promotion_requests_runtime_evidence_id_check");
    expect(promotionPreviewWaiver).toContain("drop constraint if exists production_promotion_requests_runtime_artifact_id_check");
  });

  it("certifies production-promotion approval evidence persistence contract", () => {
    expect(promotionApprovalEvidence).toContain("create table if not exists public.production_promotion_requests");
    expect(promotionApprovalEvidence).toContain("create table if not exists public.production_promotion_decisions");
    expect(promotionApprovalEvidence).toContain("check (repository = 'AIOS-HQ/aios-platform')");
    expect(promotionApprovalEvidence).toContain("check (purpose = 'production_promotion')");
    expect(promotionApprovalEvidence).toContain("check (target_sha ~ '^[0-9a-f]{40}$')");
    expect(promotionApprovalEvidence).toContain("check (source_environment = 'staging')");
    expect(promotionApprovalEvidence).toContain("check (target_environment = 'production')");
    expect(promotionApprovalEvidence).toContain("btrim(promotion_request_id) <> ''");
    expect(promotionApprovalEvidence).toContain("lower(promotion_request_id) not like '%latest%'");
    expect(promotionApprovalEvidence).toContain("lower(promotion_request_id) not like '%head%'");
    expect(promotionApprovalEvidence).toContain("lower(promotion_request_id) <> 'main'");
    expect(promotionApprovalEvidence).toContain("check (decision_source in ('founder', 'harmony'))");
    expect(promotionApprovalEvidence).toContain("check (decision in ('approved', 'rejected'))");
    expect(promotionApprovalEvidence).toContain("actor_type = 'founder'");
    expect(promotionApprovalEvidence).toContain("and agent_id is null");
    expect(promotionApprovalEvidence).toContain("and policy_version is null");
    expect(promotionApprovalEvidence).toContain("agent_id = 'harmony'");
    expect(promotionApprovalEvidence).toContain("and actor_type is null");
    expect(promotionApprovalEvidence).toContain("and actor_id is null");
    expect(promotionApprovalEvidence).toContain("and btrim(policy_version) <> ''");
    expect(promotionApprovalEvidence).toContain("and lower(policy_version) not like '%latest%'");
    expect(promotionApprovalEvidence).toContain("and lower(policy_version) not like '%head%'");
    expect(promotionApprovalEvidence).toContain("and lower(policy_version) <> 'main'");
    expect(promotionApprovalEvidence).toContain("(decision = 'approved' and approved_at is not null)");
    expect(promotionApprovalEvidence).toContain("(decision = 'rejected' and approved_at is null)");
    expect(promotionApprovalEvidence).toContain("production_promotion_decisions_request_source_uq");
    expect(promotionApprovalEvidence).toContain("enable row level security");
    expect(promotionApprovalEvidence).toContain("grant insert on public.production_promotion_requests to service_role");
    expect(promotionApprovalEvidence).toContain("grant insert on public.production_promotion_decisions to service_role");
    expect(promotionApprovalEvidence).toContain("revoke update, delete on public.production_promotion_requests from service_role");
    expect(promotionApprovalEvidence).toContain("revoke update, delete on public.production_promotion_decisions from service_role");
    expect(promotionApprovalEvidence).toContain("revoke insert, update, delete on public.production_promotion_requests from authenticated");
    expect(promotionApprovalEvidence).toContain("revoke insert, update, delete on public.production_promotion_decisions from authenticated");
    expect(promotionApprovalEvidence).toContain("create or replace function public.reject_production_promotion_mutations()");
    expect(promotionApprovalEvidence).toContain("before update or delete on public.production_promotion_requests");
    expect(promotionApprovalEvidence).toContain("before update or delete on public.production_promotion_decisions");
  });
});
