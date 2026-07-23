import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OriginMatch = boolean | "unknown";
type FailureStage =
  | "supabase_not_configured"
  | "session_cookie_missing"
  | "authenticated_user_not_resolved_with_cookie_present"
  | "founder_authorization"
  | "origin_mismatch"
  | "authenticated"
  | "unknown";

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function diagnosticEnabled(): boolean {
  if (process.env.VERCEL_ENV === "preview") return true;
  return process.env.NODE_ENV !== "production" &&
    process.env.AIOS_SESSION_DIAGNOSTIC_ENABLED === "true";
}

function originMatches(request: Request): OriginMatch {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredSiteUrl) return "unknown";
  try {
    return new URL(request.url).origin === new URL(configuredSiteUrl).origin;
  } catch {
    return "unknown";
  }
}

async function plausibleSupabaseSessionCookiePresent(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.getAll().some(({ name }) =>
    /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name));
}

function classify(input: {
  supabaseConfigured: boolean;
  supabaseCookiePresent: boolean;
  authenticatedUserResolved: boolean;
  founderAuthorizationResolved: boolean;
  requestOriginMatchesConfiguredSiteOrigin: OriginMatch;
}): { likelyFailureStage: FailureStage; operatorHint: string } {
  if (!input.supabaseConfigured) {
    return {
      likelyFailureStage: "supabase_not_configured",
      operatorHint: "verify_preview_supabase_variable_presence",
    };
  }
  if (!input.supabaseCookiePresent) {
    return {
      likelyFailureStage: "session_cookie_missing",
      operatorHint: "sign_in_on_exact_preview_alias",
    };
  }
  if (!input.authenticatedUserResolved) {
    return {
      likelyFailureStage: "authenticated_user_not_resolved_with_cookie_present",
      operatorHint: "verify_preview_supabase_project_key_and_account_alignment",
    };
  }
  if (!input.founderAuthorizationResolved) {
    return {
      likelyFailureStage: "founder_authorization",
      operatorHint: "verify_preview_founder_allowlist_or_admin_role",
    };
  }
  if (input.requestOriginMatchesConfiguredSiteOrigin === false) {
    return {
      likelyFailureStage: "origin_mismatch",
      operatorHint: "verify_preview_site_origin_configuration",
    };
  }
  if (input.requestOriginMatchesConfiguredSiteOrigin === "unknown") {
    return {
      likelyFailureStage: "unknown",
      operatorHint: "verify_preview_site_origin_configuration",
    };
  }
  return {
    likelyFailureStage: "authenticated",
    operatorHint: "open_compact_operational_certification",
  };
}

/**
 * Preview-only, non-sensitive authentication-path diagnostic.
 *
 * It reports booleans and safe classifications only. Cookie names/values,
 * identities, environment values, URLs, keys, and profile data are never
 * serialized.
 */
export async function GET(request: Request) {
  if (!diagnosticEnabled()) {
    return jsonNoStore({ ok: false, error: "not_found" }, 404);
  }

  const supabaseConfigured = isSupabaseConfigured();
  const supabaseCookiePresent = await plausibleSupabaseSessionCookiePresent();
  let authenticatedUserResolved = false;
  let founderAuthorizationResolved = false;

  if (supabaseConfigured && supabaseCookiePresent) {
    try {
      authenticatedUserResolved = Boolean(await getCurrentUser());
    } catch {
      authenticatedUserResolved = false;
    }
    if (authenticatedUserResolved) {
      try {
        founderAuthorizationResolved = await currentUserIsAdmin();
      } catch {
        founderAuthorizationResolved = false;
      }
    }
  }

  const requestOriginMatchesConfiguredSiteOrigin = originMatches(request);
  const diagnostic = {
    supabaseConfigured,
    supabaseCookiePresent,
    authenticatedUserResolved,
    founderAuthorizationResolved,
    requestOriginMatchesConfiguredSiteOrigin,
    ...classify({
      supabaseConfigured,
      supabaseCookiePresent,
      authenticatedUserResolved,
      founderAuthorizationResolved,
      requestOriginMatchesConfiguredSiteOrigin,
    }),
  };

  return jsonNoStore({
    ok: true,
    environment: process.env.VERCEL_ENV === "preview" ? "preview" : "diagnostic",
    diagnostic,
  });
}
