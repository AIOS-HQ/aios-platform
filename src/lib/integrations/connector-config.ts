import "server-only";

import type { ConnectorDef } from "@/lib/integrations/connectors";
import type { IntegrationConnection } from "@/lib/integrations/connections";

/**
 * Connector configuration + status (server-only).
 *
 * `isConnectorConfigured` only checks the PRESENCE of the founder's env vars —
 * it never reads or returns secret values. `getConnectorStatus` maps a
 * connector + its (optional) connection row onto the four dashboard states.
 */

export type ConnectorStatus = "not_connected" | "ready" | "connected" | "expired";

export function isConnectorConfigured(connector: ConnectorDef): boolean {
  // Per-user API-key connectors need no platform secret — the user supplies
  // their own key at connect time, so the platform is always "ready".
  if (connector.auth === "api_key") return true;
  if (connector.requiredEnv.length === 0) return false;
  return connector.requiredEnv.every((k) => Boolean(process.env[k]));
}

export function getConnectorStatus(
  connector: ConnectorDef,
  connection: IntegrationConnection | undefined,
): ConnectorStatus {
  if (connection) {
    return connection.status === "expired" ? "expired" : "connected";
  }
  return isConnectorConfigured(connector) ? "ready" : "not_connected";
}
