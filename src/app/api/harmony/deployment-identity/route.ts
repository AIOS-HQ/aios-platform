import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { getRuntimeDeploymentIdentity } from "@/lib/deployment/identity";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  return NextResponse.json({ ok: true, identity: getRuntimeDeploymentIdentity() });
}
