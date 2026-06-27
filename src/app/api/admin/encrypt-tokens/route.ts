import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { backfillTokenEncryption } from "@/lib/crypto/backfill";

export const runtime = "nodejs";

/**
 * One-time token-encryption backfill (founder/admin only). After setting
 * TOKEN_ENCRYPTION_KEY, POST here once to encrypt any plaintext tokens already
 * stored. Idempotent — safe to call again. Returns counts only (never tokens).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await backfillTokenEncryption();
  return NextResponse.json(result);
}
