import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/crypto/tokens";

/**
 * Integration connection persistence. Display reads go through the RLS-scoped
 * server client (owner-only) and never select token columns. Writes (from the
 * OAuth callback) use the service-role admin client.
 */

export interface IntegrationConnection {
  provider: string;
  status: string;
  scopes: string | null;
  external_account: string | null;
  created_at: string;
  /** When the connection was last (re)authorized — drives the "last sync" display. */
  connected_at: string | null;
  /** Access-token expiry (ISO); used to derive the "Authorization expired" state. */
  expires_at: string | null;
}

// Token columns are intentionally excluded from any client-reachable read.
const DISPLAY_COLUMNS =
  "provider,status,scopes,external_account,created_at,connected_at,expires_at";

export async function getConnections(userId: string): Promise<IntegrationConnection[]> {
  if (!userId) return [];
  // Reads are owner-scoped through the RLS client — never the service-role
  // admin client, which bypasses RLS and would rely solely on the app-level
  // user_id filter (defense-in-depth against an empty/forged id). Writes still
  // use the admin client (see upsertConnection / removeConnection).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select(DISPLAY_COLUMNS)
    .eq("user_id", userId);
  if (error) {
    // Table may not exist yet (migration not applied) — degrade gracefully.
    console.error("[integrations/connections] getConnections", error.message);
    return [];
  }
  return (data as IntegrationConnection[] | null) ?? [];
}

export async function getConnectedProviderIds(userId: string): Promise<Set<string>> {
  const connections = await getConnections(userId);
  return new Set(
    connections.filter((c) => c.status === "connected").map((c) => c.provider),
  );
}

export interface ConnectionUpsert {
  user_id: string;
  provider: string;
  status: string;
  scopes: string | null;
  external_account: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}

export async function upsertConnection(row: ConnectionUpsert): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[integrations/connections] upsert: admin client unavailable");
    return false;
  }
  const now = new Date().toISOString();

  const { error } = await admin
    .from("integration_connections")
    .upsert(
      {
        ...row,
        // Encrypt token columns at rest (no-op passthrough until the key is set).
        access_token: encryptToken(row.access_token),
        refresh_token: encryptToken(row.refresh_token),
        // provider_id mirrors provider (kept for downstream consumers); the
        // conflict target below is what actually dedupes the row.
        provider_id: row.provider,
        scope: row.scopes,
        external_account_id: row.external_account,
        metadata: {
          provider: row.provider,
          external_account: row.external_account,
        },
        connected_at: now,
        updated_at: now,
      },
      // CRITICAL: the conflict target MUST match the table's unique constraint,
      // which is UNIQUE (user_id, provider). Targeting (user_id, provider_id)
      // raises Postgres 42P10 ("no unique constraint matching the ON CONFLICT
      // specification"), which silently fails EVERY connection write (the OAuth
      // callback then reports ?error=persist and no row is stored). Keep this in
      // sync with the DB constraint.
      { onConflict: "user_id,provider" },
    );
  if (error) {
    console.error("[integrations/connections] upsert", error.message);
    return false;
  }
  return true;
}

export async function removeConnection(userId: string, provider: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin
    .from("integration_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) console.error("[integrations/connections] remove", error.message);
}
