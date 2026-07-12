import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/user";
import { getProviderHealth } from "@/lib/integrations/connector-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { provider } = await params;
  const health = await getProviderHealth(user.id, provider);
  const status = health.diagnostics.reason === "unknown_provider" ? 404 : 200;
  return NextResponse.json({ ok: health.healthy, health }, { status });
}
