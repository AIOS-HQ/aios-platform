import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
}

// Token columns are intentionally excluded from any client-reachable read.
const DISPLAY_COLUMNS = "provider,status,scopes,external_account,created_at";

export async function getConnections(userId: string): Promise<IntegrationConnection[]> {
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
  const { error } = await admin
    .from("integration_connections")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
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
