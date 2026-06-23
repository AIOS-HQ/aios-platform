import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GitHub OAuth — disconnect (GitHub-only).
 *
 * The generic [provider]/disconnect route validates against the legacy catalog
 * (catalog.ts), which does NOT include "github" — so it returns 404 and the UI
 * shows "something went wrong", leaving stale GitHub connections un-removable.
 *
 * This dedicated route (which overrides the dynamic route for github only, like
 * the connect/callback routes) removes the authenticated owner's GitHub
 * connection via the service-role client, scoped to their own row, and reports
 * truthful success/failure so the dashboard reflects the real result.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error("[github] disconnect: admin client unavailable");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }

  const { error } = await admin
    .from("integration_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "github");

  if (error) {
    console.error("[github] disconnect", error.message);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
