"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * Browser Supabase client (anon key). Use inside Client Components.
 * Constructed on demand so a missing env var doesn't crash module load.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
