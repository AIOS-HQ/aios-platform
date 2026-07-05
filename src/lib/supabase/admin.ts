import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client for privileged, server-only operations
 * (e.g. the OAuth callback's connection write, account deletion).
 *
 * Requires ONLY its own dependencies — the Supabase URL + the service-role key —
 * and returns null when either is absent so callers degrade gracefully. It must
 * NOT fail-fast on the whole production env set: doing so previously turned an
 * unrelated missing var (e.g. AIOS_ADMIN_EMAILS) into a thrown exception during
 * the OAuth token write, surfacing as `?error=server` even though the write's
 * real dependency (the service-role key) was present. Whole-environment
 * readiness is asserted separately (see `assertProductionEnv` / the Developer
 * Platform), never inside this client factory.
 *
 * NEVER import this into a Client Component.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !serviceKey) return null;
  return createClient(env.supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
