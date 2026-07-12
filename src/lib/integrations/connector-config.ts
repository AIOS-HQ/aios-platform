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
  if (connector.id === "vercel") {
    return Boolean(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN);
  }
  // API-key connectors without a credential model or required environment are
  // framework-only. Do not mark them ready merely because they are cataloged.
  if (connector.auth === "api_key" && connector.requiredEnv.length === 0) return false;
  if (connector.auth === "api_key") return connector.requiredEnv.every((k) => Boolean(process.env[k]));
  if (connector.requiredEnv.length === 0) return false;
  return connector.requiredEnv.every((k) => Boolean(process.env[k]));
}

export function getConnectorStatus(
  connector: ConnectorDef,
  connection: IntegrationConnection | undefined,
): ConnectorStatus {
  if (connection) {
    if (connection.status === "expired") return "expired";
    // Derive expiry from the stored token lifetime (e.g. LinkedIn tokens expire).
    if (connection.expires_at && Date.parse(connection.expires_at) < Date.now()) {
      return "expired";
    }
    return "connected";
  }
  return isConnectorConfigured(connector) ? "ready" : "not_connected";
}
