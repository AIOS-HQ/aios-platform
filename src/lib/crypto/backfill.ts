import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, isEncrypted, isTokenEncryptionEnabled } from "@/lib/crypto/tokens";

export interface BackfillResult {
  enabled: boolean;
  scanned: number;
  encrypted: number;
  skipped: number;
  failed: number;
}

/**
 * One-time, idempotent backfill: encrypt any plaintext tokens already stored in
 * integration_connections. Safe to run repeatedly — already-encrypted values are
 * skipped, and nothing is ever decrypted or deleted. No-op until the key is set.
 */
export async function backfillTokenEncryption(): Promise<BackfillResult> {
  const result: BackfillResult = {
    enabled: isTokenEncryptionEnabled(),
    scanned: 0,
    encrypted: 0,
    skipped: 0,
    failed: 0,
  };
  if (!result.enabled) return result;

  const admin = createAdminClient();
  if (!admin) return result;

  const { data, error } = await admin
    .from("integration_connections")
    .select("id,access_token,refresh_token");
  if (error || !data) return result;

  const rows = data as {
    id: string;
    access_token: string | null;
    refresh_token: string | null;
  }[];
  result.scanned = rows.length;

  for (const r of rows) {
    const needsA = r.access_token != null && !isEncrypted(r.access_token);
    const needsR = r.refresh_token != null && !isEncrypted(r.refresh_token);
    if (!needsA && !needsR) {
      result.skipped++;
      continue;
    }
    const update: Record<string, string | null> = {};
    if (needsA) update.access_token = encryptToken(r.access_token);
    if (needsR) update.refresh_token = encryptToken(r.refresh_token);
    const { error: ue } = await admin
      .from("integration_connections")
      .update(update)
      .eq("id", r.id);
    if (ue) result.failed++;
    else result.encrypted++;
  }
  return result;
}
