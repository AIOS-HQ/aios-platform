import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";

/**
 * Connector capability runtime (Phase 6a).
 *
 * The single owner-scoped entry point for running a connector capability. It
 * records an audit row in `agent_actions` (RLS owner-scoped), enforces the
 * read/write policy (writes require founder approval), and refuses to run until
 * the connector is configured. Live provider clients are added per connector in
 * later PRs (gated on founder credentials); until then capabilities audit and
 * report their state without performing any external call.
 */

export interface ConnectorRunResult {
  ok: boolean;
  status: "pending" | "blocked" | "failed";
  message: string;
}

async function audit(
  userId: string,
  tool: string,
  status: string,
  requiresApproval: boolean,
  error: string | null,
  params: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("agent_actions").insert({
      user_id: userId,
      tool,
      params,
      status,
      requires_approval: requiresApproval,
      source: "connector",
      error,
    });
  } catch (e) {
    console.error("[connectors] audit", e);
  }
}

export async function runConnectorCapability(
  userId: string,
  connectorId: string,
  capabilityId: string,
  params: Record<string, unknown> = {},
  options: { approved?: boolean } = {},
): Promise<ConnectorRunResult> {
  const tool = `connector:${connectorId}.${capabilityId}`;
  const connector = getConnector(connectorId);
  const capability = connector?.capabilities.find((c) => c.id === capabilityId);

  if (!connector || !capability) {
    await audit(userId, tool, "failed", false, "unknown_capability", params);
    return { ok: false, status: "failed", message: "unknown_capability" };
  }

  // Write actions are held for founder approval (human-in-the-loop).
  if (capability.mode === "write" && !options.approved) {
    await audit(userId, tool, "pending", true, null, params);
    return { ok: true, status: "pending", message: "needs_approval" };
  }

  const requiresApproval = capability.mode === "write";

  // Cannot run until the founder has configured the connector.
  if (!isConnectorConfigured(connector)) {
    await audit(userId, tool, "failed", requiresApproval, "not_configured", params);
    return { ok: false, status: "blocked", message: "not_configured" };
  }

  // Live provider client lands in a later PR (gated on founder credentials).
  await audit(userId, tool, "failed", requiresApproval, "not_implemented", params);
  return { ok: false, status: "blocked", message: "not_implemented" };
}
