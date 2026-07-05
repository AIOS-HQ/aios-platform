import { describe, expect, it, vi } from "vitest";
import {
  parseStateCookie,
  resolveOAuthCallback,
  type CallbackContext,
  type CallbackIO,
  type TokenResultLike,
} from "@/lib/integrations/oauth-callback";

/**
 * Regression guard for the universal OAuth callback: it must NEVER throw / 500.
 * Every failure path — bad state, failed exchange, a token write that returns
 * false OR throws (e.g. a missing prod env / fail-closed encryption) — must map
 * to a typed error the route renders as ?error=<reason>.
 */

const token: TokenResultLike = { accessToken: "at", refreshToken: "rt", expiresIn: 3600, scope: "s" };

function ctx(over: Partial<CallbackContext> = {}): CallbackContext {
  return {
    providerKnown: true,
    providerId: "gmail",
    hasProviderError: false,
    code: "auth-code",
    state: "nonce123",
    cookieRaw: "gmail:user-1:nonce123",
    ...over,
  };
}

function io(over: Partial<CallbackIO> = {}): CallbackIO {
  return {
    exchange: async () => token,
    persist: async () => true,
    ...over,
  };
}

describe("resolveOAuthCallback", () => {
  it("parses the CSRF state cookie", () => {
    expect(parseStateCookie("gmail:u1:n1")).toEqual({ pid: "gmail", uid: "u1", nonce: "n1" });
    expect(parseStateCookie("garbage")).toBeNull();
    expect(parseStateCookie("")).toBeNull();
  });

  it("succeeds on the happy path and returns the user id", async () => {
    const res = await resolveOAuthCallback(ctx(), io());
    expect(res).toEqual({ ok: true, userId: "user-1" });
  });

  it("maps a failed code exchange to error=exchange", async () => {
    expect(await resolveOAuthCallback(ctx(), io({ exchange: async () => null }))).toEqual({ ok: false, error: "exchange" });
    expect(await resolveOAuthCallback(ctx(), io({ exchange: async () => ({ ...token, accessToken: null }) }))).toEqual({ ok: false, error: "exchange" });
  });

  it("maps a failed (false) token write to error=persist", async () => {
    expect(await resolveOAuthCallback(ctx(), io({ persist: async () => false }))).toEqual({ ok: false, error: "persist" });
  });

  it("NEVER throws — a throwing token write maps to error=server and is logged", async () => {
    const onError = vi.fn();
    const res = await resolveOAuthCallback(
      ctx(),
      io({
        persist: async () => {
          throw new Error("[env] Missing production-critical environment variable(s): SUPABASE_SERVICE_ROLE_KEY");
        },
        onError,
      }),
    );
    expect(res).toEqual({ ok: false, error: "server" });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("NEVER throws — a throwing exchange maps to error=server", async () => {
    const res = await resolveOAuthCallback(ctx(), io({ exchange: async () => { throw new Error("boom"); } }));
    expect(res).toEqual({ ok: false, error: "server" });
  });

  it("rejects bad CSRF state (provider mismatch, nonce mismatch, missing code/cookie)", async () => {
    expect(await resolveOAuthCallback(ctx({ cookieRaw: "slack:user-1:nonce123" }), io())).toEqual({ ok: false, error: "state" });
    expect(await resolveOAuthCallback(ctx({ state: "different" }), io())).toEqual({ ok: false, error: "state" });
    expect(await resolveOAuthCallback(ctx({ code: null }), io())).toEqual({ ok: false, error: "state" });
    expect(await resolveOAuthCallback(ctx({ cookieRaw: "" }), io())).toEqual({ ok: false, error: "state" });
  });

  it("maps provider-side error to denied and unknown provider to unknown", async () => {
    expect(await resolveOAuthCallback(ctx({ hasProviderError: true }), io())).toEqual({ ok: false, error: "denied" });
    expect(await resolveOAuthCallback(ctx({ providerKnown: false }), io())).toEqual({ ok: false, error: "unknown" });
  });

  it("does not attempt exchange/persist when state is invalid", async () => {
    const exchange = vi.fn(async () => token);
    const persist = vi.fn(async () => true);
    await resolveOAuthCallback(ctx({ state: "wrong" }), io({ exchange, persist }));
    expect(exchange).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });
});
