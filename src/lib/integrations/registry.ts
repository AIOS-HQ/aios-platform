import { INTEGRATIONS } from "@/lib/integrations/catalog";
import {
  CONNECTORS,
  type ConnectorAuth,
  type ConnectorCapability,
  type ConnectorCategory,
  type ConnectorDef,
} from "@/lib/integrations/connectors";
import { type OAuthFamily, familyRequiredEnv } from "@/lib/integrations/oauth-families";

/**
 * Unified Connector Registry — the single source of truth for the AIOS
 * Connector Operating System.
 *
 * Composed additively (zero behaviour change to the legacy files):
 *  - `connectors.ts` (`CONNECTORS`) is the canonical base list.
 *  - An **overlay** enriches base entries that shipped as "coming soon" stubs
 *    with their OAuth family / scopes / capabilities / authorizable flag.
 *  - **Extra** entries add providers not yet in the base list.
 *  - `catalog.ts` contributes OAuth-route metadata (LinkedIn/TikTok family).
 *
 * Every connector carries the shared model: OAuth **family** (→ endpoints +
 * env + refresh strategy from the family registry), **scopes**, **capabilities**,
 * derived **requiredEnv**, provider **layers** (Founder / Customer), and the
 * `dev_configured` precondition (derived server-side in `registry-status.ts`).
 * Adding a provider = one entry here (overlay or extra) + its family env — no
 * platform code changes. This is the config-driven core: every connector is one
 * environment variable away from production.
 */

export type ConnectorLayer = "founder" | "customer";

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  auth: ConnectorAuth;
  oauthFamily?: OAuthFamily;
  scopes?: string[];
  initials: string;
  docsUrl: string;
  requiredEnv: string[];
  capabilities: ConnectorCapability[];
  authorizable: boolean;
  layers: { founder: boolean; customer: boolean };
  inLegacyCatalog: boolean;
}

const CUSTOMER_CATEGORIES = new Set<ConnectorCategory>([
  "communication",
  "productivity",
  "social",
  "storage",
  "business",
  "office_devices",
]);

function deriveLayers(category: ConnectorCategory): { founder: boolean; customer: boolean } {
  return { founder: true, customer: CUSTOMER_CATEGORIES.has(category) };
}

/** read → routine (autonomous); write defaults to approval; destructive is explicit. */
function cap(id: string, mode: "read" | "write", risk?: ConnectorCapability["risk"]): ConnectorCapability {
  return risk ? { id, mode, risk } : { id, mode };
}

// ── Overlay: enrich existing "coming soon" base stubs with their OAuth family,
//    scopes, capabilities, and authorizable flag (config only). ────────────────
interface ProviderOverlay {
  oauthFamily?: OAuthFamily;
  scopes?: string[];
  authorizable?: boolean;
  capabilities?: ConnectorCapability[];
}

const OVERLAY: Record<string, ProviderOverlay> = {
  google_drive: {
    oauthFamily: "google",
    authorizable: true,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    capabilities: [cap("list_files", "read"), cap("upload_file", "write", "routine"), cap("delete_file", "write", "destructive")],
  },
  google_workspace: {
    oauthFamily: "google",
    authorizable: true,
    scopes: ["https://www.googleapis.com/auth/admin.directory.user.readonly"],
    capabilities: [cap("list_users", "read"), cap("read_org_units", "read")],
  },
  outlook: {
    oauthFamily: "microsoft",
    authorizable: true,
    scopes: ["Mail.Read", "Mail.Send", "offline_access"],
    capabilities: [cap("list_messages", "read"), cap("draft_reply", "write", "routine"), cap("send_message", "write", "approval")],
  },
  microsoft_365: {
    oauthFamily: "microsoft",
    authorizable: true,
    scopes: ["User.Read", "offline_access"],
    capabilities: [cap("read_profile", "read")],
  },
  outlook_calendar: {
    oauthFamily: "microsoft",
    authorizable: true,
    scopes: ["Calendars.ReadWrite", "offline_access"],
    capabilities: [cap("list_events", "read"), cap("create_event", "write", "routine"), cap("cancel_meeting", "write", "approval")],
  },
  teams: {
    oauthFamily: "microsoft",
    authorizable: true,
    scopes: ["ChannelMessage.Send", "Team.ReadBasic.All", "offline_access"],
    capabilities: [cap("list_channels", "read"), cap("post_message", "write", "approval")],
  },
  dropbox: {
    oauthFamily: "dropbox",
    authorizable: true,
    scopes: ["files.content.read", "files.content.write"],
    capabilities: [cap("list_files", "read"), cap("upload_file", "write", "routine"), cap("delete_file", "write", "destructive")],
  },
  hubspot: {
    oauthFamily: "hubspot",
    authorizable: true,
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
    capabilities: [cap("list_contacts", "read"), cap("create_contact", "write", "routine"), cap("delete_contact", "write", "destructive")],
  },
  salesforce: {
    oauthFamily: "salesforce",
    authorizable: true,
    scopes: ["api", "refresh_token"],
    capabilities: [cap("query_records", "read"), cap("create_record", "write", "approval"), cap("delete_record", "write", "destructive")],
  },
  shopify: {
    oauthFamily: "shopify",
    authorizable: true,
    scopes: ["read_products", "read_orders"],
    capabilities: [cap("list_products", "read"), cap("list_orders", "read"), cap("update_product", "write", "approval")],
  },
};

// ── Extra: providers not yet in the base list (defined natively here). ────────
function extra(
  id: string,
  name: string,
  category: ConnectorCategory,
  auth: ConnectorAuth,
  initials: string,
  docsUrl: string,
  opts: { oauthFamily?: OAuthFamily; scopes?: string[]; requiredEnv?: string[]; capabilities?: ConnectorCapability[]; authorizable?: boolean } = {},
): ConnectorDefinition {
  const requiredEnv =
    opts.requiredEnv ?? (auth === "oauth2" && opts.oauthFamily ? familyRequiredEnv(opts.oauthFamily) : []);
  return {
    id,
    name,
    category,
    auth,
    oauthFamily: opts.oauthFamily,
    scopes: opts.scopes,
    initials,
    docsUrl,
    requiredEnv,
    capabilities: opts.capabilities ?? [],
    authorizable: opts.authorizable ?? (auth === "oauth2" && Boolean(opts.oauthFamily)),
    layers: deriveLayers(category),
    inLegacyCatalog: false,
  };
}

const EXTRA: ConnectorDefinition[] = [
  extra("notion", "Notion", "productivity", "oauth2", "No", "https://developers.notion.com/docs/authorization", {
    oauthFamily: "notion",
    scopes: [],
    capabilities: [cap("search", "read"), cap("read_page", "read"), cap("create_page", "write", "routine"), cap("update_page", "write", "approval")],
  }),
  extra("discord", "Discord", "communication", "oauth2", "Dc", "https://discord.com/developers/docs/topics/oauth2", {
    oauthFamily: "discord",
    scopes: ["identify", "guilds"],
    capabilities: [cap("list_guilds", "read"), cap("post_message", "write", "approval")],
  }),
  extra("x", "X (Twitter)", "social", "oauth2", "X", "https://developer.x.com/en/docs/authentication/oauth-2-0", {
    oauthFamily: "x",
    scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"],
    capabilities: [cap("read_timeline", "read"), cap("textPost", "write", "approval"), cap("imagePost", "write", "approval"), cap("multiImagePost", "write", "approval"), cap("videoPost", "write", "approval")],
  }),
  extra("jira", "Jira", "productivity", "oauth2", "Ji", "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/", {
    oauthFamily: "atlassian",
    scopes: ["read:jira-work", "write:jira-work", "offline_access"],
    capabilities: [cap("list_issues", "read"), cap("create_issue", "write", "routine"), cap("transition_issue", "write", "approval")],
  }),
  extra("linear", "Linear", "productivity", "oauth2", "Ln", "https://developers.linear.app/docs/oauth/authentication", {
    oauthFamily: "linear",
    scopes: ["read", "write", "issues:create"],
    capabilities: [cap("list_issues", "read"), cap("create_issue", "write", "routine"), cap("update_issue", "write", "approval")],
  }),
  extra("box", "Box", "storage", "oauth2", "Bx", "https://developer.box.com/guides/authentication/oauth2/", {
    oauthFamily: "box",
    scopes: ["root_readwrite"],
    capabilities: [cap("list_files", "read"), cap("upload_file", "write", "routine"), cap("delete_file", "write", "destructive")],
  }),
  extra("onedrive", "OneDrive", "storage", "oauth2", "OD", "https://learn.microsoft.com/graph/api/resources/onedrive", {
    oauthFamily: "microsoft",
    scopes: ["Files.ReadWrite", "offline_access"],
    capabilities: [cap("list_files", "read"), cap("upload_file", "write", "routine"), cap("delete_file", "write", "destructive")],
  }),
  extra("google_docs", "Google Docs", "productivity", "oauth2", "GD", "https://developers.google.com/docs/api", {
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/documents"],
    capabilities: [cap("read_document", "read"), cap("create_document", "write", "routine"), cap("edit_document", "write", "approval")],
  }),
  extra("google_sheets", "Google Sheets", "productivity", "oauth2", "GS", "https://developers.google.com/sheets/api", {
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    capabilities: [cap("read_sheet", "read"), cap("append_rows", "write", "routine"), cap("update_range", "write", "approval")],
  }),
  extra("google_meet", "Google Meet", "communication", "oauth2", "GM", "https://developers.google.com/meet/api/guides/overview", {
    oauthFamily: "google",
    scopes: ["https://www.googleapis.com/auth/meetings.space.created"],
    capabilities: [cap("list_conferences", "read"), cap("create_meeting", "write", "routine")],
  }),
  extra("twilio", "Twilio", "communication", "api_key", "Tw", "https://www.twilio.com/docs/usage/api", {
    requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    capabilities: [cap("list_messages", "read"), cap("send_sms", "write", "approval")],
  }),
];

// OAuth family from the legacy catalog, keyed by id (fills LinkedIn/TikTok).
const CATALOG_FAMILY = new Map<string, OAuthFamily | undefined>(
  INTEGRATIONS.map((p) => [p.id, p.oauthFamily as OAuthFamily | undefined]),
);
const CATALOG_IDS = new Set(INTEGRATIONS.map((p) => p.id));

function fromBase(c: ConnectorDef): ConnectorDefinition {
  const o = OVERLAY[c.id] ?? {};
  const oauthFamily = (o.oauthFamily ?? c.oauthFamily ?? CATALOG_FAMILY.get(c.id)) as OAuthFamily | undefined;
  const authorizable = o.authorizable ?? c.authorizable ?? false;
  const capabilities = o.capabilities ?? c.capabilities;
  const scopes = o.scopes ?? c.scopes;
  // Derive requiredEnv from the family for OAuth connectors that ship without it.
  const requiredEnv =
    c.requiredEnv.length > 0
      ? c.requiredEnv
      : c.auth === "oauth2" && oauthFamily
        ? familyRequiredEnv(oauthFamily)
        : [];
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    auth: c.auth,
    oauthFamily,
    scopes,
    initials: c.initials,
    docsUrl: c.docsUrl,
    requiredEnv,
    capabilities,
    authorizable,
    layers: deriveLayers(c.category),
    inLegacyCatalog: CATALOG_IDS.has(c.id),
  };
}

/** The one registry: enriched base list + extra providers. */
export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [
  ...CONNECTORS.map(fromBase),
  ...EXTRA,
];

export function getConnectorDefinition(id: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.id === id);
}

export function listConnectorDefinitions(): ConnectorDefinition[] {
  return CONNECTOR_REGISTRY;
}

/** Connectors eligible for a given workspace layer (default eligibility). */
export function connectorsForLayer(layer: ConnectorLayer): ConnectorDefinition[] {
  return CONNECTOR_REGISTRY.filter((c) => c.layers[layer]);
}
