import "server-only";

import { getConnectionSecret } from "@/lib/integrations/secrets";

/**
 * Read-only Supabase diagnostics (Phase 6b).
 *
 * Uses the user's Supabase Management API token + project ref to run read-only
 * SQL via the Management query endpoint. No writes, ever. Degrades gracefully:
 * any failure yields an `unavailable` item rather than throwing. The token is
 * read service-side only and never exposed to the browser.
 */

export interface DiagnosticItem {
  id: string;
  ok: boolean;
  detail: string;
}
export interface DiagnosticsResult {
  connected: boolean;
  items: DiagnosticItem[];
}

const MGMT = "https://api.supabase.com/v1/projects";

/** Migrations this platform expects to exist (the additive ones we shipped). */
const EXPECTED_MIGRATIONS = ["20260604000000", "20260605000000", "20260606000000"];

async function runQuery(
  ref: string,
  token: string,
  query: string,
): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${MGMT}/${encodeURIComponent(ref)}/database/query`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    return Array.isArray(json) ? json : null;
  } catch (e) {
    console.error("[diagnostics] supabase query", e);
    return null;
  }
}

export async function runSupabaseDiagnostics(userId: string): Promise<DiagnosticsResult> {
  const secret = await getConnectionSecret(userId, "supabase");
  if (!secret || !secret.externalAccount) return { connected: false, items: [] };
  const ref = secret.externalAccount;
  const token = secret.accessToken;
  const items: DiagnosticItem[] = [];

  const health = await runQuery(ref, token, "select 1 as ok;");
  items.push({
    id: "db_health_check",
    ok: Array.isArray(health),
    detail: Array.isArray(health) ? "reachable" : "unreachable",
  });

  const migs = await runQuery(
    ref,
    token,
    "select version from supabase_migrations.schema_migrations;",
  );
  if (Array.isArray(migs)) {
    const versions = migs.map((r) => String((r as { version?: string }).version ?? ""));
    const missing = EXPECTED_MIGRATIONS.filter((v) => !versions.includes(v));
    items.push({
      id: "migration_verification",
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(", ")}` : "all expected migrations present",
    });
  } else {
    items.push({ id: "migration_verification", ok: false, detail: "unavailable" });
  }

  const tables = await runQuery(
    ref,
    token,
    "select table_name from information_schema.tables where table_schema = 'public';",
  );
  items.push({
    id: "public_table_inspection",
    ok: Array.isArray(tables),
    detail: Array.isArray(tables) ? `${tables.length} public tables` : "unavailable",
  });

  const rls = await runQuery(
    ref,
    token,
    "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r';",
  );
  if (Array.isArray(rls)) {
    const without = rls.filter(
      (r) => !(r as { relrowsecurity?: boolean }).relrowsecurity,
    ).length;
    items.push({
      id: "rls_diagnostics",
      ok: without === 0,
      detail: without === 0 ? "RLS enabled on all public tables" : `${without} table(s) without RLS`,
    });
  } else {
    items.push({ id: "rls_diagnostics", ok: false, detail: "unavailable" });
  }

  return { connected: true, items };
}
