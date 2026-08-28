import { describe, expect, it } from "vitest";
import type { AuthError } from "@supabase/supabase-js";
import {
  NORMALIZED_AUTH_ERROR_CODES,
  normalizeAuthErrorCode,
} from "../../src/lib/auth/error-codes";

type AuthErrorLike = Pick<AuthError, "code" | "status">;

function authErrorFixture(code: AuthErrorLike["code"], status: AuthErrorLike["status"]): AuthErrorLike {
  return { code, status };
}

describe("auth error code normalization", () => {
  it("maps invalid_credentials directly", () => {
    expect(normalizeAuthErrorCode(authErrorFixture("invalid_credentials", 400))).toBe("invalid_credentials");
  });

  it("maps known allow-listed Supabase auth codes directly", () => {
    const mapped = [
      normalizeAuthErrorCode(authErrorFixture("email_not_confirmed", 400)),
      normalizeAuthErrorCode(authErrorFixture("user_banned", 403)),
      normalizeAuthErrorCode(authErrorFixture("over_request_rate_limit", 429)),
      normalizeAuthErrorCode(authErrorFixture("over_email_send_rate_limit", 429)),
      normalizeAuthErrorCode(authErrorFixture("captcha_failed", 400)),
      normalizeAuthErrorCode(authErrorFixture("validation_failed", 400)),
    ];

    expect(mapped).toEqual([
      "email_not_confirmed",
      "user_banned",
      "over_request_rate_limit",
      "over_email_send_rate_limit",
      "captcha_failed",
      "validation_failed",
    ]);
  });

  it("maps unknown codes and raw text to unknown_auth_error", () => {
    expect(normalizeAuthErrorCode(authErrorFixture("some_new_code", 400))).toBe("unknown_auth_error");
    expect(normalizeAuthErrorCode(authErrorFixture("Incorrect email or password.", 400))).toBe("unknown_auth_error");
  });

  it("maps upstream server failures to auth_server_error", () => {
    expect(normalizeAuthErrorCode(authErrorFixture("unexpected_failure", 500))).toBe("auth_server_error");
    expect(normalizeAuthErrorCode(authErrorFixture(undefined, 503))).toBe("auth_server_error");
  });

  it("exposes only allow-listed normalized codes", () => {
    for (const code of NORMALIZED_AUTH_ERROR_CODES) {
      expect(normalizeAuthErrorCode(authErrorFixture(code, 400))).toBe(code);
    }
  });
});
