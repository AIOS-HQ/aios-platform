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
    expect(certification).toContain("migrations.length !== 51");
    expect(certification).toContain("migration_failed:${basename(path)}");
    expect(certification).toContain("non_local_postgres_rejected");
    expect(certification).toContain("persistent_database_environment_rejected");
    expect(workflow).toContain("pgvector/pgvector:pg15");
    expect(workflow).toContain("node-version: 22");
    expect(workflow).not.toMatch(/supabase\s+(?:link|db push)|vercel|service[_-]role[_-]key/i);
  });
});
