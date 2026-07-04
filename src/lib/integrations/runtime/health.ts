import "server-only";

import { getConnectorDefinition } from "@/lib/integrations/registry";
import { isDevConfigured, devConfigurationGaps } from "@/lib/integrations/registry-status";
import { getConnections } from "@/lib/integrations/connections";
import type { HealthStatus } from "./types";

/**
 * Universal health monitoring + diagnostics. Owner-scoped, read-only, and
 * token-free (only presence/status are inspected). Returns a uniform status for
 * any connector so a single health surface can render the whole ecosystem.
 */
export async function checkConnectorHealth(
  connectorId: string,
  userId: string,
): Promise<HealthStatus> {
  const def = getConnectorDefinition(connectorId);
  if (!def) {
    return {
      connectorId,
      devConfigured: false,
      connected: false,
      expired: false,
      gaps: ["Unknown connector"],
      detail: "Unknown connector",
    };
  }

  const devConfigured = isDevConfigured(def);
  const gaps = devConfigurationGaps(def);
  const connections = await getConnections(userId);
  const conn = connections.find((c) => c.provider === connectorId);
  const connected = conn?.status === "connected";
  const expired =
    connected && conn?.expires_at ? new Date(conn.expires_at).getTime() < Date.now() : false;

  const detail = !devConfigured
    ? "Developer configuration incomplete"
    : !connected
      ? "Not connected"
      : expired
        ? "Authorization expired"
        : "Healthy";

  return { connectorId, devConfigured, connected, expired, gaps, detail };
}
