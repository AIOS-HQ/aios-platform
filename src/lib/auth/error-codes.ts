import type { AuthError } from "@supabase/supabase-js";

export const NORMALIZED_AUTH_ERROR_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_banned",
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "captcha_failed",
  "validation_failed",
  "auth_server_error",
  "unknown_auth_error",
] as const;

export type NormalizedAuthErrorCode = (typeof NORMALIZED_AUTH_ERROR_CODES)[number];

const NORMALIZED_AUTH_ERROR_CODE_SET = new Set<NormalizedAuthErrorCode>(NORMALIZED_AUTH_ERROR_CODES);

/** Maps Supabase AuthError metadata into a safe, normalized machine code. */
export function normalizeAuthErrorCode(error: Pick<AuthError, "code" | "status"> | null | undefined): NormalizedAuthErrorCode {
  const code = typeof error?.code === "string" ? error.code : "";
  if (NORMALIZED_AUTH_ERROR_CODE_SET.has(code as NormalizedAuthErrorCode)) {
    return code as NormalizedAuthErrorCode;
  }

  if (code === "unexpected_failure") {
    return "auth_server_error";
  }

  if (typeof error?.status === "number" && error.status >= 500) {
    return "auth_server_error";
  }

  return "unknown_auth_error";
}

