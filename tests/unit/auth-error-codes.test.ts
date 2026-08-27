import { describe, expect, it } from "vitest";
import {
  NORMALIZED_AUTH_ERROR_CODES,
  normalizeAuthErrorCode,
} from "../../src/lib/auth/error-codes";

describe("auth error code normalization", () => {
  it("maps invalid_credentials directly", () => {
    expect(normalizeAuthErrorCode({ code: "invalid_credentials", status: 400 } as any)).toBe("invalid_credentials");
  });

  it("maps known allow-listed Supabase auth codes directly", () => {
    const mapped = [
      normalizeAuthErrorCode({ code: "email_not_confirmed", status: 400 } as any),
      normalizeAuthErrorCode({ code: "user_banned", status: 403 } as any),
      normalizeAuthErrorCode({ code: "over_request_rate_limit", status: 429 } as any),
      normalizeAuthErrorCode({ code: "over_email_send_rate_limit", status: 429 } as any),
      normalizeAuthErrorCode({ code: "captcha_failed", status: 400 } as any),
      normalizeAuthErrorCode({ code: "validation_failed", status: 400 } as any),
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
    expect(normalizeAuthErrorCode({ code: "some_new_code", status: 400 } as any)).toBe("unknown_auth_error");
    expect(normalizeAuthErrorCode({ code: "Incorrect email or password.", status: 400 } as any)).toBe("unknown_auth_error");
  });

  it("maps upstream server failures to auth_server_error", () => {
    expect(normalizeAuthErrorCode({ code: "unexpected_failure", status: 500 } as any)).toBe("auth_server_error");
    expect(normalizeAuthErrorCode({ code: undefined, status: 503 } as any)).toBe("auth_server_error");
  });

  it("exposes only allow-listed normalized codes", () => {
    for (const code of NORMALIZED_AUTH_ERROR_CODES) {
      expect(normalizeAuthErrorCode({ code, status: 400 } as any)).toBe(code);
    }
  });
});

