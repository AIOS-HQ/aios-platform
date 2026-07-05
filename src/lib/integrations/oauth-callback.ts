/**
 * OAuth callback orchestration — pure, dependency-injected, and fully testable.
 *
 * The universal `/api/integrations/[provider]/callback` route is a thin adapter
 * over this: it maps the outcome to a redirect. Extracting the logic here lets
 * us guarantee the invariant the hard way (a unit test): the callback NEVER
 * throws / 500s — every failure (bad state, failed code exchange, a throwing/
 * failed token write, or ANY unexpected error) resolves to a typed error the
 * route turns into `?error=<reason>` (with a short `detail` on `server`, so the
 * exact exception is visible in the redirect URL without server-log access).
 *
 * No I/O here: the code-exchange and persistence are injected, so this is pure
 * and runs in Node tests without Next/Supabase.
 */

export type CallbackError = "unknown" | "denied" | "state" | "exchange" | "persist" | "server";
export type CallbackResult =
  | { ok: true; userId: string }
  | { ok: false; error: CallbackError; detail?: string };

export interface TokenResultLike {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
}

export interface PersistInput {
  userId: string;
  providerId: string;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresIn: number | null;
}

export interface CallbackContext {
  /** getConnectorDefinition(providerId) !== undefined */
  providerKnown: boolean;
  providerId: string;
  /** The provider returned ?error= (user denied / provider-side failure). */
  hasProviderError: boolean;
  code: string | null;
  state: string | null;
  /** The CSRF state cookie value ("providerId:userId:nonce"). */
  cookieRaw: string;
}

export interface CallbackIO {
  exchange: (code: string) => Promise<TokenResultLike | null>;
  persist: (input: PersistInput) => Promise<boolean>;
  /** Observed on any thrown error, so the route can log it to server logs. */
  onError?: (stage: string, err: unknown) => void;
}

/** Parse the "providerId:userId:nonce" CSRF state cookie. */
export function parseStateCookie(raw: string): { pid: string; uid: string; nonce: string } | null {
  const [pid, uid, nonce] = raw.split(":");
  if (!pid || !uid || !nonce) return null;
  return { pid, uid, nonce };
}

/**
 * Resolve an OAuth callback to a typed outcome. Guarantees no throw escapes:
 * exchange + persist run inside a try/catch that maps any error to "server"
 * (with the exception message as `detail`).
 */
export async function resolveOAuthCallback(ctx: CallbackContext, io: CallbackIO): Promise<CallbackResult> {
  if (!ctx.providerKnown) return { ok: false, error: "unknown" };
  if (ctx.hasProviderError) return { ok: false, error: "denied" };

  const parsed = parseStateCookie(ctx.cookieRaw);
  if (
    !ctx.code ||
    !ctx.state ||
    !parsed ||
    parsed.pid !== ctx.providerId ||
    parsed.nonce !== ctx.state
  ) {
    return { ok: false, error: "state" };
  }

  try {
    const token = await io.exchange(ctx.code);
    if (!token || !token.accessToken) return { ok: false, error: "exchange" };

    const persisted = await io.persist({
      userId: parsed.uid,
      providerId: ctx.providerId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scope: token.scope,
      expiresIn: token.expiresIn,
    });
    if (!persisted) return { ok: false, error: "persist" };

    return { ok: true, userId: parsed.uid };
  } catch (err) {
    io.onError?.("callback", err);
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: "server", detail };
  }
}
