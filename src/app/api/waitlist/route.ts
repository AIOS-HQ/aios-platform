import { NextResponse } from "next/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Waitlist / early-access capture endpoint.
 *
 * Intentionally stateless: it validates the submission and acknowledges it
 * without touching the database — no new tables or schema changes. The intent
 * is logged so it is observable, and durable persistence (CRM / email) will be
 * wired in with the integration framework. Keeping this contract stable means
 * the client form does not change when persistence is added later.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; source?: unknown }
    | null;

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const source = typeof body?.source === "string" ? body.source : "landing";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 },
    );
  }

  // No persistence yet (no schema changes). Log for observability.
  console.info(`[waitlist] signup: ${email} (source: ${source})`);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "waitlist" });
}
