import "server-only";

import { getCurrentUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";

/**
 * Founder/admin email allowlist from env. This is a BOOTSTRAP: the `profiles`
 * table defaults every new user to `personal_user` and nothing seeds an
 * `admin` role, so without this the Founder OS (gated to admins) would be
 * hidden from everyone — including the founder. Set `AIOS_ADMIN_EMAILS` to a
 * comma-separated list of founder/admin emails. The DB role `admin` keeps
 * working in addition to this.
 */
function adminAllowlist(): string[] {
  return (process.env.AIOS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Pure founder/admin check from an already-loaded email + role — no I/O, so
 * callers that already have the profile (e.g. the app layout) avoid a second
 * fetch while sharing one definition of "founder". Founder = email in the env
 * allowlist OR DB role `admin`.
 */
export function isFounderUser(
  email: string | null | undefined,
  role: string | null | undefined,
): boolean {
  const e = email?.toLowerCase();
  if (e && adminAllowlist().includes(e)) return true;
  return role === "admin";
}

/** True when the current user is a founder/admin (env allowlist OR DB role). */
export async function currentUserIsAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.email && adminAllowlist().includes(user.email.toLowerCase())) {
    return true;
  }
  const profile = await getProfile(user.id);
  return isFounderUser(user.email, profile?.role);
}

/**
 * Whether test/diagnostic affordances (e.g. simulating an inbound message) may
 * be used. Allowed outside production for everyone; in production, admin-only.
 * This keeps dev/preview workflows intact while preventing the tools from being
 * triggered in production by a non-admin.
 */
export async function canUseDiagnostics(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  return currentUserIsAdmin();
}
