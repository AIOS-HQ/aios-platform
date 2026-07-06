import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getConnectorHealth } from "@/lib/integrations/connector-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only connector health snapshot for the current user's connections.
 * Returns status, token-encryption state, expiry/refreshability, last refresh,
 * and a recommended action per connector. Never returns token values.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const connectors = await getConnectorHealth(user.id);
  return NextResponse.json({ ok: true, count: connectors.length, connectors });
}
