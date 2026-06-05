import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles Supabase email links (signup confirmation, password recovery).
 * Exchanges the PKCE `code` for a session, then redirects to `next`.
 */
/**
 * Only allow same-origin, absolute-path redirects. Rejects protocol-relative
 * (`//evil.com`), scheme, and host-changing values (`@evil.com`, `.evil.com`)
 * that would otherwise turn `${origin}${next}` into an off-site redirect.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/harmony";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
