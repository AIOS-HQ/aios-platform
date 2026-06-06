import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getIntegration } from "@/lib/integrations/catalog";
import { removeConnection } from "@/lib/integrations/connections";

export const runtime = "nodejs";

/** Disconnect a provider for the authenticated user. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: pid } = await params;
  if (!getIntegration(pid)) {
    return NextResponse.json({ error: "unknown" }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await removeConnection(user.id, pid);
  return NextResponse.json({ ok: true });
}
