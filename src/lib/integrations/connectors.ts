/**
 * Harmony connector framework.
 *
 * Client-safe metadata describing every connector Harmony can use, the
 * capabilities each exposes, the risk class of each capability (which governs
 * autonomous vs approval-gated execution), and the credentials each will
 * eventually require. Source of truth for the AIOS Integration Center, the
 * autonomy policy engine, and the Approval Center.
 *
 * Contains NO secrets — only the NAMES of env vars a founder will set later.
 * No live OAuth happens here. The legacy catalog in `catalog.ts` still powers
 * /settings/integrations; this framework is additive.
 *
 * Connectors marked `authorizable: true` have a live OAuth flow wired
 * (/api/integrations/[provider]/connect). The remaining entries are the
 * scalable catalog the Integration Center renders as "coming soon" until their
 * connection flow + capabilities are implemented in a later phase (most need
 * provider credentials, which are a founder infrastructure action).
 */

export type ConnectorAuth = "oauth2" | "api_key" | "webhook" | "device";
export type ConnectorCategory =
  | "development"
  | "communication"
  | "productivity"
  | "data"
  | "social"
  | "business"
  | "storage"
  | "ai"
  | "office_devices";
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
      { id: "commit_file_to_branch", mode: "write", risk: "routine" },
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
    authorizable: true,
    capabilities: [
      { id: "list_channels", mode: "read" },
      { id: "read_channel", mode: "read" },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn Sign-In",
    category: "social",
    auth: "oauth2",
    // OpenID Connect sign-in scopes (identity only). Publishing is handled by
    // the separate AIOS Publisher app and must never use this connector token.
    scopes: ["openid", "profile", "email"],
    initials: "in",
    docsUrl: "https://learn.microsoft.com/linkedin",
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    authorizable: true,
    capabilities: [
      { id: "read_profile", mode: "read" },
      { id: "verify_identity", mode: "read" },
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
    authorizable: true,
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
    authorizable: true,
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
  // ---- Integration Platform catalog (Phase 1 foundation) ------------------
  // Scalable catalog the Integration Center renders. `capabilities` and live
  // OAuth are implemented per-connector in later phases (most require provider
  // credentials — a founder infrastructure action), so these are not yet
  // `authorizable`.
  //
  // Communication
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "communication",
    auth: "oauth2",
    initials: "WA",
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "outlook",
    name: "Outlook",
    category: "communication",
    auth: "oauth2",
    initials: "OL",
    docsUrl: "https://learn.microsoft.com/graph/outlook-mail-concept-overview",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "messenger",
    name: "Messenger",
    category: "communication",
    auth: "oauth2",
    initials: "Me",
    docsUrl: "https://developers.facebook.com/docs/messenger-platform",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "communication",
    auth: "oauth2",
    initials: "IG",
    docsUrl: "https://developers.facebook.com/docs/instagram-platform",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    category: "communication",
    auth: "oauth2",
    initials: "TM",
    docsUrl: "https://learn.microsoft.com/graph/teams-concept-overview",
    requiredEnv: [],
    capabilities: [],
  },
  // Business
  {
    id: "stripe",
    name: "Stripe",
    category: "business",
    auth: "oauth2",
    initials: "St",
    docsUrl: "https://stripe.com/docs/connect/oauth-reference",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "business",
    auth: "oauth2",
    initials: "Sh",
    docsUrl: "https://shopify.dev/docs/apps/auth",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "business",
    auth: "oauth2",
    initials: "HS",
    docsUrl: "https://developers.hubspot.com/docs/api/oauth-quickstart-guide",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "business",
    auth: "oauth2",
    initials: "SF",
    docsUrl: "https://developer.salesforce.com/docs",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    category: "business",
    auth: "oauth2",
    initials: "QB",
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/develop",
    requiredEnv: [],
    capabilities: [],
  },
  // Productivity
  {
    id: "google_workspace",
    name: "Google Workspace",
    category: "productivity",
    auth: "oauth2",
    oauthFamily: "google",
    initials: "GW",
    docsUrl: "https://developers.google.com/workspace",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "microsoft_365",
    name: "Microsoft 365",
    category: "productivity",
    auth: "oauth2",
    initials: "M3",
    docsUrl: "https://learn.microsoft.com/graph/overview",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "outlook_calendar",
    name: "Outlook Calendar",
    category: "productivity",
    auth: "oauth2",
    initials: "OC",
    docsUrl: "https://learn.microsoft.com/graph/api/resources/calendar",
    requiredEnv: [],
    capabilities: [],
  },
  // Storage
  {
    id: "google_drive",
    name: "Google Drive",
    category: "storage",
    auth: "oauth2",
    oauthFamily: "google",
    initials: "GD",
    docsUrl: "https://developers.google.com/drive",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "storage",
    auth: "oauth2",
    initials: "Db",
    docsUrl: "https://www.dropbox.com/developers/documentation",
    requiredEnv: [],
    capabilities: [],
  },
  // AI
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    auth: "api_key",
    initials: "AI",
    docsUrl: "https://platform.openai.com/docs",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "ai",
    auth: "api_key",
    initials: "An",
    docsUrl: "https://docs.anthropic.com",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "gemini",
    name: "Gemini",
    category: "ai",
    auth: "api_key",
    initials: "Ge",
    docsUrl: "https://ai.google.dev/docs",
    requiredEnv: [],
    capabilities: [],
  },
  // Office Devices (connected over the local network — not OAuth/API)
  {
    id: "printer",
    name: "Printer",
    category: "office_devices",
    auth: "device",
    initials: "Pr",
    docsUrl: "https://www.pwg.org/ipp/",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "scanner",
    name: "Scanner",
    category: "office_devices",
    auth: "device",
    initials: "Sc",
    docsUrl: "https://www.pwg.org/ipp/",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "fax",
    name: "Fax",
    category: "office_devices",
    auth: "device",
    initials: "Fx",
    docsUrl: "https://www.pwg.org/ipp/",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "multifunction_device",
    name: "Multifunction Device",
    category: "office_devices",
    auth: "device",
    initials: "MF",
    docsUrl: "https://www.pwg.org/ipp/",
    requiredEnv: [],
    capabilities: [],
  },
  {
    id: "network_storage",
    name: "Network Storage",
    category: "office_devices",
    auth: "device",
    initials: "NS",
    docsUrl: "https://en.wikipedia.org/wiki/Network-attached_storage",
    requiredEnv: [],
    capabilities: [],
  },
];

export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  "communication",
  "business",
  "productivity",
  "storage",
  "ai",
  "office_devices",
  "development",
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
