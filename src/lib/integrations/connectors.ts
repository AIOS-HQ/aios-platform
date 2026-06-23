/**
 * Harmony connector framework.
 *
 * Client-safe metadata describing every connector Harmony can use, the
 * capabilities each exposes, the risk class of each capability (which governs
 * autonomous vs approval-gated execution), and the credentials each will
 * eventually require. Source of truth for the Connections dashboard, the
 * autonomy policy engine, and the Approval Center.
 *
 * Contains NO secrets — only the NAMES of env vars a founder will set later.
 * No live OAuth happens here. The legacy catalog in `catalog.ts` still powers
 * /settings/integrations; this framework is additive.
 */

export type ConnectorAuth = "oauth2" | "api_key" | "webhook";
export type ConnectorCategory =
  | "development"
  | "communication"
  | "productivity"
  | "data"
  | "social";
export type OAuthFamily = "google" | "github" | "slack";

/**
 * Risk class governs autonomy:
 *  - routine     → executes autonomously (owner-scoped + audited)
 *  - approval    → held for founder approval before executing
 *  - destructive → held for founder approval AND flagged high-risk / irreversible
 */
export type RiskClass = "routine" | "approval" | "destructive";

export interface ConnectorCapability {
  /** Stable id, e.g. "list_issues". */
  id: string;
  /** read = data only; write = changes state somewhere. */
  mode: "read" | "write";
  /** Explicit risk override. Defaults: read → routine, write → approval. */
  risk?: RiskClass;
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
  /** When true, the dashboard offers a live "Authorize" action (OAuth wired). */
  authorizable?: boolean;
}

export const CONNECTORS: ConnectorDef[] = [
  // ---- Founder Stack ------------------------------------------------------
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
    authorizable: true,
    capabilities: [
      { id: "list_repos", mode: "read" },
      { id: "list_issues", mode: "read" },
      { id: "list_pull_requests", mode: "read" },
      { id: "list_branches", mode: "read" },
      { id: "list_workflows", mode: "read" },
      { id: "review_build_result", mode: "read" },
      { id: "monitor_deployment", mode: "read" },
      { id: "create_branch", mode: "write", risk: "routine" },
      { id: "open_pull_request", mode: "write", risk: "routine" },
      { id: "create_issue", mode: "write", risk: "routine" },
      { id: "merge_pull_request", mode: "write", risk: "approval" },
      { id: "delete_repository", mode: "write", risk: "destructive" },
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
      { id: "list_deployments", mode: "read" },
      { id: "trigger_deployment", mode: "write", risk: "routine" },
      { id: "delete_env_var", mode: "write", risk: "destructive" },
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
      { id: "monitor_database_health", mode: "read" },
      { id: "destroy_database", mode: "write", risk: "destructive" },
    ],
  },
  // ---- Content Engine -----------------------------------------------------
  {
    id: "youtube",
    name: "YouTube",
    category: "social",
    auth: "oauth2",
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    initials: "YT",
    docsUrl: "https://developers.google.com/youtube",
    requiredEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    capabilities: [
      { id: "research_topic", mode: "read" },
      { id: "generate_script", mode: "write", risk: "routine" },
      { id: "generate_metadata", mode: "write", risk: "routine" },
      { id: "generate_thumbnail", mode: "write", risk: "routine" },
      { id: "publish_video", mode: "write", risk: "approval" },
      { id: "upload_short", mode: "write", risk: "approval" },
      { id: "delete_video", mode: "write", risk: "destructive" },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    auth: "oauth2",
    // OpenID Connect sign-in scopes (identity only). Publishing
    // (w_member_social) requires a separately approved LinkedIn product; add it
    // here once that product is granted. The dedicated /api/integrations/linkedin
    // routes request exactly these scopes.
    scopes: ["openid", "profile", "email"],
    initials: "in",
    docsUrl: "https://learn.microsoft.com/linkedin",
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    authorizable: true,
    capabilities: [
      { id: "research_topic", mode: "read" },
      { id: "draft_post", mode: "write", risk: "routine" },
      { id: "generate_hashtags", mode: "write", risk: "routine" },
      { id: "publish_post", mode: "write", risk: "approval" },
      { id: "delete_post", mode: "write", risk: "destructive" },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "social",
    auth: "oauth2",
    scopes: ["user.info.basic", "video.list"],
    initials: "TT",
    docsUrl: "https://developers.tiktok.com",
    requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    capabilities: [
      { id: "research_topic", mode: "read" },
      { id: "generate_concept", mode: "write", risk: "routine" },
      { id: "generate_caption", mode: "write", risk: "routine" },
      { id: "publish_video", mode: "write", risk: "approval" },
      { id: "delete_video", mode: "write", risk: "destructive" },
    ],
  },
  // ---- Chief of Staff -----------------------------------------------------
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
      { id: "categorize_messages", mode: "read" },
      { id: "draft_response", mode: "write", risk: "routine" },
      { id: "archive_message", mode: "write", risk: "routine" },
      { id: "send_message", mode: "write", risk: "approval" },
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
      { id: "monitor_schedule", mode: "read" },
      { id: "create_event", mode: "write", risk: "routine" },
      { id: "resolve_conflict", mode: "write", risk: "routine" },
      { id: "adjust_availability", mode: "write", risk: "routine" },
      { id: "cancel_external_meeting", mode: "write", risk: "approval" },
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
      { id: "monitor_channels", mode: "read" },
      { id: "summarize_discussion", mode: "read" },
      { id: "respond_routine", mode: "write", risk: "routine" },
      { id: "route_issue", mode: "write", risk: "routine" },
      { id: "post_announcement", mode: "write", risk: "approval" },
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
      { id: "trigger_workflow", mode: "write", risk: "routine" },
      { id: "notify_service", mode: "write", risk: "routine" },
      { id: "send_event", mode: "write", risk: "routine" },
    ],
  },
];

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  "development",
  "communication",
  "productivity",
  "data",
  "social",
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
