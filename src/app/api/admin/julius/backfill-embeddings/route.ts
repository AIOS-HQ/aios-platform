import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { backfillJuliusEmbeddings } from "@/lib/julius/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only Julius knowledge indexing: embed all of the caller's un-embedded
 * Julius entries so semantic retrieval (match_julius_entries) returns results.
 * Idempotent (already-embedded rows are skipped by the null filter). Never
 * returns embeddings or content — only counts. `enabled: false` in the response
 * means OPENAI_API_KEY is not configured in this environment.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const result = await backfillJuliusEmbeddings(user.id);
  return NextResponse.json({ ok: true, ...result });
}
