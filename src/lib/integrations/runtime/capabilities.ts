import {
  getConnectorDefinition,
  listConnectorDefinitions,
  type ConnectorDefinition,
} from "@/lib/integrations/registry";
import type { ConnectorCapability } from "@/lib/integrations/connectors";
import type { PermissionLevel } from "./types";

/**
 * Capability loading + discovery + permission derivation — all from the unified
 * registry, so every connector exposes its capabilities the same way and no
 * provider hard-codes its own list.
 */

/** Capabilities a connector exposes (loading). */
export function listCapabilities(connectorId: string): ConnectorCapability[] {
  return getConnectorDefinition(connectorId)?.capabilities ?? [];
}

export function getCapability(
  connectorId: string,
  capabilityId: string,
): ConnectorCapability | undefined {
  return listCapabilities(connectorId).find((c) => c.id === capabilityId);
}

/** Every (connector, capability) pair across the ecosystem — capability discovery. */
export function discoverCapabilities(): Array<{
  connector: ConnectorDefinition;
  capability: ConnectorCapability;
}> {
  const out: Array<{ connector: ConnectorDefinition; capability: ConnectorCapability }> = [];
  for (const connector of listConnectorDefinitions()) {
    for (const capability of connector.capabilities) {
      out.push({ connector, capability });
    }
  }
  return out;
}

/**
 * Map a capability's mode + risk class to the governance permission level it
 * requires. Defaults mirror the Autonomy Policy Engine: read → routine
 * (autonomous), write → approval, destructive → explicit destructive approval.
 */
export function capabilityPermission(cap: ConnectorCapability): PermissionLevel {
  const risk = cap.risk ?? (cap.mode === "write" ? "approval" : "routine");
  if (risk === "destructive") return "destructive_approval";
  if (risk === "approval") return "approval_required";
  return "autonomous";
}
