import "server-only";

import { getConnections } from "@/lib/integrations/connections";
import { getConnector, type ConnectorCategory } from "@/lib/integrations/connectors";

/**
 * Integration auto-discovery.
 *
 * Maps the owner's live Integration Center connections onto the connector
 * registry so other modules can recognize a service that was authorized once,
 * with NO duplicate connection state or configuration flow. Communications
 * reads the connected communication channels; Content/Catalyst reads the
 * connected publishing platforms. Pure read over getConnections (which itself
 * degrades to an empty list when the table is missing), so callers get a quiet
 * empty result until a matching connector is connected.
 */
export interface DiscoveredConnector {
  id: string;
  name: string;
  initials: string;
  category: ConnectorCategory;
  externalAccount: string | null;
  connectedAt: string | null;
}

async function discoverByCategory(
  userId: string,
  categories: ConnectorCategory[],
): Promise<DiscoveredConnector[]> {
  const connections = await getConnections(userId);
  const out: DiscoveredConnector[] = [];
  for (const conn of connections) {
    if (conn.status !== "connected") continue;
    const def = getConnector(conn.provider);
    if (!def || !categories.includes(def.category)) continue;
    out.push({
      id: def.id,
      name: def.name,
      initials: def.initials,
      category: def.category,
      externalAccount: conn.external_account,
      connectedAt: conn.connected_at,
    });
  }
  return out;
}

/** Communication channels connected via the Integration Center (for Communications). */
export function getDiscoveredChannels(userId: string): Promise<DiscoveredConnector[]> {
  return discoverByCategory(userId, ["communication"]);
}

/** Publishing platforms connected via the Integration Center (for Content/Catalyst). */
export function getDiscoveredPublishers(userId: string): Promise<DiscoveredConnector[]> {
  return discoverByCategory(userId, ["social"]);
}
