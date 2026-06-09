/**
 * Harmony connector framework (Phase 6a).
 *
 * Client-safe metadata describing every connector Harmony can use, the
 * capabilities each exposes (read vs write), and the credentials each will
 * eventually require. This is the source of truth for the Connections dashboard.
 *
 * It contains NO secrets — only the NAMES of the environment variables a founder
 * will set later. No live OAuth happens here. The legacy provider catalog in
 * `catalog.ts` still powers /settings/integrations; this framework is additive.
 */

export type ConnectorAuth = "oauth2" | "api_key" | "webhook";
export type ConnectorCategory =
  | "development"
  | "communication"
  | "productivity"
  | "data";
export type OAuthFamily = "google" | "github" | "slack";

export interface ConnectorCapability {
  /** Stable id, e.g. "list_issues". */
  id: string;
  /** read = safe, runs directly; write = requires founder approval first. */
  mode: "read" | "write";
}

export interface ConnectorDef {
  id: string;
  name: string;
  category: ConnectorCategory;
  auth: ConnectorAuth;
  /** OAuth client family backing this connector (oauth2 only). */
  oauthFamily?: OAuthFamily;
  /** OAuth scopes requested at authorization (oauth2 only). */
  scopes?: string[];
  /** Monogram for the UI tile. */
  initials: string;
  docsUrl: string;
  /**
   * Names of the environment variables this connector needs before it can go
   * live. Empty for per-user API-key connectors that need no platform secret.
   * NEVER put secret VALUES here — names only (documentation).
   */
  requiredEnv: string[];
  capabilities: ConnectorCapability[];
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "github",
    name: "GitHub",
    category: "development",
    auth: "oauth2",
    oauthFamily: "github",
    scopes: ["read:user", "repo"],
    initials: "GH",
    docsUrl: "https://docs.github.com/rest",
    requiredEnv: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET"],
    capabilities: [
      { id: "list_repos", mode: "read" },
      { id: "list_issues", mode: "read" },
      { id: "create_issue", mode: "write" },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "development",
    auth: "api_key",
    initials: "VC",
    docsUrl: "https://vercel.com/docs/rest-api",
    requiredEnv: [],
    capabilities: [
      { id: "deployment_status", mode: "read" },
      { id: "production_url_verification", mode: "read" },
      { id: "build_status", mode: "read" },
      { id: "env_var_presence", mode: "read" },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "communication",
    auth: "oauth2",
    oauthFamily: "google",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    initials: "GM",
    docsUrl: "https://developers.google.com/gmail/api",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    capabilities: [
      { id: "list_messages", mode: "read" },
      { id: "send_message", mode: "write" },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    auth: "oauth2",
    oauthFamily: "slack",
    scopes: ["channels:read", "chat:write"],
    initials: "SL",
    docsUrl: "https://api.slack.com",
    requiredEnv: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET"],
    capabilities: [
      { id: "list_channels", mode: "read" },
      { id: "post_message", mode: "write" },
    ],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    category: "productivity",
    auth: "oauth2",
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
    initials: "GC",
    docsUrl: "https://developers.google.com/calendar",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    capabilities: [
      { id: "list_events", mode: "read" },
      { id: "create_event", mode: "write" },
    ],
  },
  {
    id: "webhooks",
    name: "Webhooks",
    category: "productivity",
    auth: "webhook",
    initials: "WH",
    docsUrl: "https://developer.mozilla.org/docs/Web/API/Fetch_API",
    requiredEnv: ["WEBHOOK_SIGNING_SECRET"],
    capabilities: [
      { id: "list_endpoints", mode: "read" },
      { id: "send_event", mode: "write" },
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "data",
    auth: "api_key",
    initials: "SB",
    docsUrl: "https://supabase.com/docs",
    requiredEnv: [],
    capabilities: [
      { id: "db_health_check", mode: "read" },
      { id: "migration_verification", mode: "read" },
      { id: "public_table_inspection", mode: "read" },
      { id: "rls_diagnostics", mode: "read" },
    ],
  },
];

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  "development",
  "communication",
  "productivity",
  "data",
];

export function getConnector(id: string): ConnectorDef | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function listConnectors(): ConnectorDef[] {
  return CONNECTORS;
}

export function countCapabilities(c: ConnectorDef): { read: number; write: number } {
  return {
    read: c.capabilities.filter((x) => x.mode === "read").length,
    write: c.capabilities.filter((x) => x.mode === "write").length,
  };
}
