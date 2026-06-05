import "server-only";

import { getCurrentUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";

/** True when the current user has the admin role. */
export async function currentUserIsAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const profile = await getProfile(user.id);
  return profile?.role === "admin";
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
