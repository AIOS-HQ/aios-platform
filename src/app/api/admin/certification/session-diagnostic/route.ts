import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveExpectedPreviewHost(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function resolveRequestHost(request: Request): string | null {
  try {
    const host = new URL(request.url).hostname.trim().toLowerCase();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const founderAuthorized = await currentUserIsAdmin();
  if (!founderAuthorized) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const expectedPreviewHost = resolveExpectedPreviewHost(process.env.AIOS_VALIDATION_VERCEL_PREVIEW_HOST);
  const requestHost = resolveRequestHost(request);
  const requestOriginMatchesConfiguredSiteOrigin =
    Boolean(expectedPreviewHost)
    && Boolean(requestHost)
    && requestHost === expectedPreviewHost;

  if (!requestOriginMatchesConfiguredSiteOrigin) {
    return NextResponse.json({ ok: false, error: "preview_origin_mismatch" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  const cookieHeader = request.headers.get("cookie");
  const supabaseCookiePresent = typeof cookieHeader === "string" && cookieHeader.includes("sb-");

  if (authError || !authUser) {
    return NextResponse.json({ ok: false, error: "authenticated_user_not_resolved" }, { status: 401 });
  }

  const diagnostic = {
    supabaseConfigured: true,
    supabaseCookiePresent,
    authenticatedUserResolved: true,
    founderAuthorizationResolved: true,
    requestOriginMatchesConfiguredSiteOrigin,
    likelyFailureStage: "authenticated" as const,
  };

  return NextResponse.json({
    ok: true,
    environment: "preview",
    diagnostic,
  });
}
