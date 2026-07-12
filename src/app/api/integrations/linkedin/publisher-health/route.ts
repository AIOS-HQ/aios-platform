import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { getLinkedInPublisherHealth } from "@/lib/integrations/linkedin-publisher";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const health = await getLinkedInPublisherHealth();
  return NextResponse.json({ ...health, checkedAt: new Date().toISOString() });
}
