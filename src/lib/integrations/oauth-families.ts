import "server-only";

/**
 * Unified OAuth family registry — the single source of truth for every OAuth
 * provider family AIOS connects to (the Connector Operating System's OAuth
 * engine config). ONE table powers BOTH authorization (`config.ts`) and token
 * refresh (`token-refresh.ts`), so the two can never drift again — previously
 * they defined separate, inconsistent family sets AND env-var names (e.g.
 * `GOOGLE_CLIENT_ID` for authorize vs `GOOGLE_OAUTH_CLIENT_ID` for refresh).
 *
 * Adding a provider family = one entry here. NO secrets in code — only the
 * NAMES of the env vars a platform admin sets in Layer 1 (Developer Platform).
 * Legacy env-var names are accepted as aliases during migration so nothing that
 * is already configured breaks.
 */

export type OAuthFamily =
  | "google"
  | "github"
  | "slack"
  | "linkedin"
  | "tiktok"
  | "microsoft"
  | "notion"
  | "discord"
  | "x"
  | "hubspot"
  | "salesforce"
  | "shopify"
  | "atlassian"
  | "linear"
  | "dropbox"
  | "box";

export interface OAuthFamilyDef {
  /** Canonical client-id env var. */
  clientIdEnv: string;
  /** Legacy client-id env names read as a fallback (migration compatibility). */
  clientIdEnvAliases?: string[];
  /** Canonical client-secret env var. */
  clientSecretEnv: string;
  /** Legacy client-secret env names read as a fallback. */
  clientSecretEnvAliases?: string[];
  authUrl: string;
  tokenUrl: string;
  /** Param name for the client id (most use `client_id`; TikTok uses `client_key`). */
  clientIdParam: string;
  /** Whether this family issues refresh tokens the platform can rotate. */
  refreshSupported: boolean;
  /** Whether the family requires/should use PKCE (e.g. X / Twitter v2). */
  pkce?: boolean;
  /** Extra authorize params (e.g. Google offline access). */
  authParams?: Record<string, string>;
  /** OpenID/userinfo endpoint for the display identity (optional). */
  userInfoUrl?: string;
}

/**
 * Canonical env scheme going forward: `{PROVIDER}_OAUTH_CLIENT_ID` /
 * `{PROVIDER}_OAUTH_CLIENT_SECRET`. Endpoints are public and safe to hardcode.
 * `authUrl`/`tokenUrl` left empty for families whose endpoints are tenant- or
 * shop-specific (resolved per-connection in a later stage); those are not
 * "configured" until both endpoints and creds are present.
 */
export const OAUTH_FAMILIES: Record<OAuthFamily, OAuthFamilyDef> = {
  google: {
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientIdEnvAliases: ["GOOGLE_CLIENT_ID"],
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    clientSecretEnvAliases: ["GOOGLE_CLIENT_SECRET"],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdParam: "client_id",
    refreshSupported: true,
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  },
  github: {
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdParam: "client_id",
    refreshSupported: false,
    userInfoUrl: "https://api.github.com/user",
  },
  slack: {
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdParam: "client_id",
    refreshSupported: true,
  },
  linkedin: {
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdParam: "client_id",
    refreshSupported: false,
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdParam: "client_key",
    refreshSupported: true,
  },
  microsoft: {
    clientIdEnv: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_OAUTH_CLIENT_SECRET",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientIdParam: "client_id",
    refreshSupported: true,
    authParams: { response_mode: "query" },
  },
  notion: {
    clientIdEnv: "NOTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientIdParam: "client_id",
    refreshSupported: false,
    authParams: { owner: "user" },
  },
  discord: {
    clientIdEnv: "DISCORD_OAUTH_CLIENT_ID",
    clientSecretEnv: "DISCORD_OAUTH_CLIENT_SECRET",
    authUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    clientIdParam: "client_id",
    refreshSupported: true,
  },
  x: {
    clientIdEnv: "X_OAUTH_CLIENT_ID",
    clientSecretEnv: "X_OAUTH_CLIENT_SECRET",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    clientIdParam: "client_id",
    refreshSupported: true,
    pkce: true,
  },
  hubspot: {
    clientIdEnv: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_OAUTH_CLIENT_SECRET",
    authUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdParam: "client_id",
    refreshSupported: true,
  },
  salesforce: {
    clientIdEnv: "SALESFORCE_OAUTH_CLIENT_ID",
    clientSecretEnv: "SALESFORCE_OAUTH_CLIENT_SECRET",
    authUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    clientIdParam: "client_id",
    refreshSupported: true,
  },
  shopify: {
    // Shopify authorize/token endpoints are shop-specific (per store domain),
    // resolved per-connection in a later stage; creds are platform-level.
    clientIdEnv: "SHOPIFY_OAUTH_CLIENT_ID",
    clientSecretEnv: "SHOPIFY_OAUTH_CLIENT_SECRET",
    authUrl: "",
    tokenUrl: "",
    clientIdParam: "client_id",
    refreshSupported: false,
  },
  atlassian: {
    clientIdEnv: "ATLASSIAN_OAUTH_CLIENT_ID",
    clientSecretEnv: "ATLASSIAN_OAUTH_CLIENT_SECRET",
    authUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    clientIdParam: "client_id",
    refreshSupported: true,
    authParams: { audience: "api.atlassian.com", prompt: "consent" },
  },
  linear: {
    clientIdEnv: "LINEAR_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINEAR_OAUTH_CLIENT_SECRET",
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    clientIdParam: "client_id",
    refreshSupported: false,
  },
  dropbox: {
    clientIdEnv: "DROPBOX_OAUTH_CLIENT_ID",
    clientSecretEnv: "DROPBOX_OAUTH_CLIENT_SECRET",
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropboxapi.com/oauth2/token",
    clientIdParam: "client_id",
    refreshSupported: true,
    authParams: { token_access_type: "offline" },
  },
  box: {
    clientIdEnv: "BOX_OAUTH_CLIENT_ID",
    clientSecretEnv: "BOX_OAUTH_CLIENT_SECRET",
    authUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    clientIdParam: "client_id",
    refreshSupported: true,
  },
};

export interface ResolvedOAuthFamily extends OAuthFamilyDef {
  family: OAuthFamily;
  clientId: string;
  clientSecret: string;
}

/** Read the first present env var among [canonical, ...aliases]. */
function readEnv(name: string, aliases?: string[]): string {
  for (const key of [name, ...(aliases ?? [])]) {
    const value = process.env[key];
    if (value) return value;
  }
  return "";
}

/**
 * Resolve a family's live credentials + endpoints, or null if it is not fully
 * configured (missing client id/secret, or endpoints not yet known). Never
 * returns secret values to callers beyond the server-only OAuth engine.
 */
export function resolveOAuthFamily(family: OAuthFamily): ResolvedOAuthFamily | null {
  const def = OAUTH_FAMILIES[family];
  if (!def) return null;
  if (!def.authUrl || !def.tokenUrl) return null;
  const clientId = readEnv(def.clientIdEnv, def.clientIdEnvAliases);
  const clientSecret = readEnv(def.clientSecretEnv, def.clientSecretEnvAliases);
  if (!clientId || !clientSecret) return null;
  return { ...def, family, clientId, clientSecret };
}

/**
 * Whether a family's developer credentials are present (a Layer 1 / "dev
 * configured" precondition for offering a Connect button). Presence check only
 * — never reads or returns the secret values.
 */
export function isFamilyConfigured(family: OAuthFamily): boolean {
  return resolveOAuthFamily(family) !== null;
}

/** The canonical env-var names a family requires (for docs / Developer Platform). */
export function familyRequiredEnv(family: OAuthFamily): string[] {
  const def = OAUTH_FAMILIES[family];
  if (!def) return [];
  return [def.clientIdEnv, def.clientSecretEnv];
}
