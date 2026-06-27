import "server-only";

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { assertProductionEnv } from "@/lib/env.server";

/**
 * Service-role Supabase client for privileged, server-only operations
 * (e.g. account deletion via the Auth admin API). Returns null when the
 * service-role key isn't configured, so callers can degrade gracefully.
 *
 * NEVER import this into a Client Component.
 */
export function createAdminClient() {
  assertProductionEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !serviceKey) return null;
  return createClient(env.supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
