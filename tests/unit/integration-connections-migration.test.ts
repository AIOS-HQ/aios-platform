import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prepare = readFileSync(
  "supabase/migrations/20260617110000_prepare_integration_connections_reconciliation.sql",
  "utf8",
);
const reconcile = readFileSync(
  "supabase/migrations/20260723000000_reconcile_integration_connections.sql",
  "utf8",
);
const connections = readFileSync("src/lib/integrations/connections.ts", "utf8");
const workflow = readFileSync(
  ".github/workflows/integration-connections-migration-certification.yml",
  "utf8",
);

describe("integration_connections migration reconciliation", () => {
  it("places a compatibility bridge before the conflicting historical migration", () => {
    expect("20260617110000_prepare_integration_connections_reconciliation.sql"
      < "20260617120000_add_integration_connections.sql").toBe(true);
    expect(prepare).toContain("add column if not exists provider_id text");
    expect(prepare).toContain("integration_connections_user_provider_id_key");
  });

  it("keeps the application column family canonical and the newer names as mirrors", () => {
    expect(connections).toContain('"provider,status,scopes,external_account');
    expect(connections).toContain('{ onConflict: "user_id,provider" }');
    expect(reconcile).toContain("check (provider = provider_id)");
    expect(reconcile).toContain("check (scopes is not distinct from scope)");
    expect(reconcile).toContain("check (external_account is not distinct from external_account_id)");
  });

  it("fails closed on mixed conflicting values and preserves tokens", () => {
    expect(reconcile).toContain("integration_connections_conflicting_provider_values");
    expect(reconcile).toContain("integration_connections_conflicting_scope_values");
    expect(reconcile).toContain("integration_connections_conflicting_external_account_values");
    expect(reconcile).not.toMatch(/drop\s+column|delete\s+from|truncate/i);
    expect(reconcile).toContain("add column if not exists access_token text");
    expect(reconcile).toContain("add column if not exists refresh_token text");
  });

  it("restores owner-read and service-role-write connection security", () => {
    expect(reconcile).toContain('create policy "owner_select"');
    expect(reconcile).toContain("revoke all privileges on table public.integration_connections from anon, authenticated");
    expect(reconcile).toContain("on table public.integration_connections to authenticated");
    expect(reconcile).not.toMatch(/grant\s+(insert|update|delete).*integration_connections.*authenticated/i);
  });

  it("grants Mason only append/read privileges while preserving append-only RLS", () => {
    expect(reconcile).toContain("grant select, insert on table public.mason_execution_events to authenticated");
    expect(reconcile).toContain("revoke update, delete on table public.mason_execution_events from authenticated");
  });

  it("runs only against an explicitly guarded disposable local PostgreSQL service", () => {
    expect(workflow).toContain("image: postgres:15");
    expect(workflow).toContain('MIGRATION_TEST_ALLOW_LOCAL_POSTGRES: "true"');
    expect(workflow).not.toMatch(/supabase\.com|SUPABASE_(?:URL|TOKEN|PASSWORD|KEY)|service[_-]role/i);
    expect(workflow).not.toMatch(/db\s+push|supabase\s+link|vercel/i);
  });
});
