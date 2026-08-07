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
    expect(certification).toContain("migrations.length !== 55");
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
});
