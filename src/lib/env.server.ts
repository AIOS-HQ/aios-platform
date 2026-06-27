import "server-only";

import { isProductionRuntime } from "@/lib/env";

export const PRODUCTION_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AIOS_ADMIN_EMAILS",
  "TOKEN_ENCRYPTION_KEY",
] as const;

function publicSupabaseKeyPresent(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getMissingProductionEnv(): string[] {
  const missing: string[] = PRODUCTION_REQUIRED_ENV.filter((key) => !process.env[key]);
  if (!publicSupabaseKeyPresent()) {
    missing.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return missing;
}

export function assertProductionEnv(): void {
  if (!isProductionRuntime()) return;
  const missing = getMissingProductionEnv();
  if (missing.length === 0) return;
  throw new Error(
    `[env] Missing production-critical environment variable(s): ${missing.join(", ")}`,
  );
}
