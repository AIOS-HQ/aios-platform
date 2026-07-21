import "server-only";

import {
  createDiagnosticItem,
  createDiagnosticsResult,
  type CertifiedDiagnosticItem,
  type CertifiedDiagnosticsResult,
} from "@/lib/evidence/certification";
import { getConnectionSecret } from "@/lib/integrations/secrets";

/**
 * Read-only Supabase diagnostics (Phase 6b).
 *
 * Uses the user's Supabase Management API token + project ref to run read-only
 * SQL via the Management query endpoint. No writes, ever. Degrades gracefully:
 * any failure yields an `unavailable` item rather than throwing. The token is
 * read service-side only and never exposed to the browser.
 */

type DiagnosticEvidenceDetails = {
  scope: "supabase_management" | "vercel_deployment";
  check: string;
};

type DiagnosticsEvidenceDetails = {
  scope: "supabase_diagnostics" | "vercel_diagnostics";
  itemCount: number;
};

export type DiagnosticItem = CertifiedDiagnosticItem<DiagnosticEvidenceDetails>;
export type DiagnosticsResult = CertifiedDiagnosticsResult<
  DiagnosticEvidenceDetails,
  DiagnosticsEvidenceDetails
>;

const MGMT = "https://api.supabase.com/v1/projects";

/** Migrations this platform expects to exist (the additive ones we shipped). */
const EXPECTED_MIGRATIONS = ["20260604000000", "20260605000000", "20260606000000"];

export async function runSupabaseManagementQuery(
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
  const observedAt = new Date();
  const secret = await getConnectionSecret(userId, "supabase");
  if (!secret || !secret.externalAccount) {
    return createDiagnosticsResult({
      connected: false,
      items: [],
      evidenceType: "configuration_proof",
      observedBy: "diagnostics.supabase",
      confidence: 0.9,
      observedAt,
      details: { scope: "supabase_diagnostics", itemCount: 0 },
    });
  }
  const ref = secret.externalAccount;
  const token = secret.accessToken;
  const items: DiagnosticItem[] = [];

  const health = await runSupabaseManagementQuery(ref, token, "select 1 as ok;");
  items.push(createDiagnosticItem({
    id: "db_health_check",
    ok: Array.isArray(health),
    detail: Array.isArray(health) ? "reachable" : "unreachable",
    evidenceType: "authenticated_runtime_proof",
    observedBy: "diagnostics.supabase",
    confidence: 0.95,
    observedAt,
    failureStatus: "unavailable",
    details: { scope: "supabase_management", check: "database_reachability" },
  }));

  const migs = await runSupabaseManagementQuery(
    ref,
    token,
    "select version from supabase_migrations.schema_migrations;",
  );
  if (Array.isArray(migs)) {
    const versions = migs.map((r) => String((r as { version?: string }).version ?? ""));
    const missing = EXPECTED_MIGRATIONS.filter((v) => !versions.includes(v));
    items.push(createDiagnosticItem({
      id: "migration_verification",
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(", ")}` : "all expected migrations present",
      evidenceType: "authenticated_runtime_proof",
      observedBy: "diagnostics.supabase",
      confidence: 0.95,
      observedAt,
      details: { scope: "supabase_management", check: "migration_verification" },
    }));
  } else {
    items.push(createDiagnosticItem({
      id: "migration_verification",
      ok: false,
      detail: "unavailable",
      evidenceType: "authenticated_runtime_proof",
      observedBy: "diagnostics.supabase",
      confidence: 0.8,
      observedAt,
      failureStatus: "unavailable",
      details: { scope: "supabase_management", check: "migration_verification" },
    }));
  }

  const tables = await runSupabaseManagementQuery(
    ref,
    token,
    "select table_name from information_schema.tables where table_schema = 'public';",
  );
  items.push(createDiagnosticItem({
    id: "public_table_inspection",
    ok: Array.isArray(tables),
    detail: Array.isArray(tables) ? `${tables.length} public tables` : "unavailable",
    evidenceType: "authenticated_runtime_proof",
    observedBy: "diagnostics.supabase",
    confidence: 0.9,
    observedAt,
    failureStatus: "unavailable",
    details: { scope: "supabase_management", check: "public_table_inspection" },
  }));

  const rls = await runSupabaseManagementQuery(
    ref,
    token,
    "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r';",
  );
  if (Array.isArray(rls)) {
    const without = rls.filter(
      (r) => !(r as { relrowsecurity?: boolean }).relrowsecurity,
    ).length;
    items.push(createDiagnosticItem({
      id: "rls_diagnostics",
      ok: without === 0,
      detail: without === 0 ? "RLS enabled on all public tables" : `${without} table(s) without RLS`,
      evidenceType: "authenticated_runtime_proof",
      observedBy: "diagnostics.supabase",
      confidence: 0.95,
      observedAt,
      details: { scope: "supabase_management", check: "rls_diagnostics" },
    }));
  } else {
    items.push(createDiagnosticItem({
      id: "rls_diagnostics",
      ok: false,
      detail: "unavailable",
      evidenceType: "authenticated_runtime_proof",
      observedBy: "diagnostics.supabase",
      confidence: 0.8,
      observedAt,
      failureStatus: "unavailable",
      details: { scope: "supabase_management", check: "rls_diagnostics" },
    }));
  }

  return createDiagnosticsResult({
    connected: true,
    items,
    evidenceType: "authenticated_runtime_proof",
    observedBy: "diagnostics.supabase",
    confidence: 0.95,
    observedAt,
    details: { scope: "supabase_diagnostics", itemCount: items.length },
  });
}
