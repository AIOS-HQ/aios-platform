import { INTEGRATIONS } from "@/lib/integrations/catalog";
import {
  CONNECTORS,
  type ConnectorAuth,
  type ConnectorCapability,
  type ConnectorCategory,
  type ConnectorDef,
} from "@/lib/integrations/connectors";
import type { OAuthFamily } from "@/lib/integrations/oauth-families";

/**
 * Unified Connector Registry — the single source of truth for the AIOS
 * Connector Operating System (Stage 1b).
 *
 * This composes the two historical registries into ONE shared model without
 * changing either of them (zero behaviour change, full backwards compatibility):
 *  - `connectors.ts` (`CONNECTORS`) is the canonical superset (capabilities,
 *    requiredEnv, authorizable) and the base for every entry.
 *  - `catalog.ts` (`INTEGRATIONS`) contributes the OAuth-route metadata for the
 *    six providers wired to the generic `[provider]` routes (notably the
 *    `oauthFamily` for LinkedIn/TikTok, which lives only in the legacy catalog).
 *
 * Every connector now flows through ONE registration pipeline (add an entry to
 * `CONNECTORS` and it appears here automatically) and carries the shared model:
 * provider **layers** (Founder / Customer) and a **dev_configured** precondition
 * (derived server-side in `registry-status.ts`). Consumers should migrate to
 * these accessors; the legacy `getIntegration()` / `getConnector()` APIs remain
 * fully operational as adapters during the transition.
 */

export type ConnectorLayer = "founder" | "customer";

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  auth: ConnectorAuth;
  /** Unified OAuth family (from the OAuth family registry). */
  oauthFamily?: OAuthFamily;
  scopes?: string[];
  initials: string;
  docsUrl: string;
  requiredEnv: string[];
  capabilities: ConnectorCapability[];
  /** A live OAuth/connect flow is wired for this provider. */
  authorizable: boolean;
  /**
   * Which workspace layers this connector is designed for. Founder Mode and
   * Customer Mode share the SAME framework; they differ only in permissions,
   * scopes, capabilities, and UI. Per-tenant customer enablement is a Layer 2
   * founder control layered on top of this default eligibility.
   */
  layers: { founder: boolean; customer: boolean };
  /** Also present in the legacy OAuth-route catalog (`INTEGRATIONS`). */
  inLegacyCatalog: boolean;
}

/**
 * Default layer eligibility. Founder Mode can use everything; Customer Mode
 * defaults to the customer-appropriate surfaces (comms, productivity, social,
 * storage, business, devices) and excludes founder infrastructure (development,
 * data). This is only the DEFAULT — the Founder explicitly enables the subset a
 * customer sees (Layer 2), which never widens beyond these defaults.
 */
const CUSTOMER_CATEGORIES = new Set<ConnectorCategory>([
  "communication",
  "productivity",
  "social",
  "storage",
  "business",
  "office_devices",
]);

function deriveLayers(c: ConnectorDef): { founder: boolean; customer: boolean } {
  return { founder: true, customer: CUSTOMER_CATEGORIES.has(c.category) };
}

// OAuth family from the legacy catalog, keyed by id (fills in LinkedIn/TikTok,
// whose family lived only in `catalog.ts`).
const CATALOG_FAMILY = new Map<string, OAuthFamily | undefined>(
  INTEGRATIONS.map((p) => [p.id, p.oauthFamily as OAuthFamily | undefined]),
);
const CATALOG_IDS = new Set(INTEGRATIONS.map((p) => p.id));

/** The one registry. Composed from the canonical connector list + catalog metadata. */
export const CONNECTOR_REGISTRY: ConnectorDefinition[] = CONNECTORS.map((c) => ({
  id: c.id,
  name: c.name,
  category: c.category,
  auth: c.auth,
  oauthFamily: (c.oauthFamily ?? CATALOG_FAMILY.get(c.id)) as OAuthFamily | undefined,
  scopes: c.scopes,
  initials: c.initials,
  docsUrl: c.docsUrl,
  requiredEnv: c.requiredEnv,
  capabilities: c.capabilities,
  authorizable: c.authorizable ?? false,
  layers: deriveLayers(c),
  inLegacyCatalog: CATALOG_IDS.has(c.id),
}));

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
