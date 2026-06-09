import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Service-role read of a user's stored connector credential (Phase 6b).
 *
 * Token columns are never selected by the RLS client; this server-only helper
 * uses the admin client to fetch a stored per-user API key for server-side
 * read-only use. The value is NEVER returned to the browser.
 */

export interface ConnectionSecret {
  accessToken: string;
  externalAccount: string | null;
}

export async function getConnectionSecret(
  userId: string,
  provider: string,
): Promise<ConnectionSecret | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("integration_connections")
    .select("access_token,external_account")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { access_token: string | null; external_account: string | null };
  if (!row.access_token) return null;
  return { accessToken: row.access_token, externalAccount: row.external_account };
}
