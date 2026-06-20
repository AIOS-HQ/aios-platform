import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";
import { effectiveRisk } from "@/lib/agent/policy";
import { runGithubRead } from "@/lib/integrations/clients/github";
import { runGithubWrite } from "@/lib/integrations/clients/github-write";

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
  status: "executed" | "pending" | "blocked" | "failed";
  message: string;
  data?: Record<string, unknown>;
}

async function audit(
  userId: string,
  tool: string,
  status: string,
  requiresApproval: boolean,
  error: string | null,
  params: Record<string, unknown>,
  result: Record<string, unknown> | null = null,
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
      result,
      executed_at:
        status === "executed" || status === "failed"
          ? new Date().toISOString()
          : null,
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

  const risk = effectiveRisk(capability);
  const requiresApproval = risk !== "routine";

  // Sensitive (approval) and high-risk (destructive) actions are held for the
  // founder; routine actions may proceed autonomously. Human-in-the-loop.
  if (requiresApproval && !options.approved) {
    await audit(
      userId,
      tool,
      "pending",
      true,
      risk === "destructive" ? "destructive" : null,
      params,
    );
    return {
      ok: true,
      status: "pending",
      message: risk === "destructive" ? "needs_approval_destructive" : "needs_approval",
    };
  }

  // Cannot run until the founder has configured the connector.
  if (!isConnectorConfigured(connector)) {
    await audit(userId, tool, "failed", requiresApproval, "not_configured", params);
    return { ok: false, status: "blocked", message: "not_configured" };
  }

   // Live execution — GitHub capabilities. All owner-scoped + audited.
  if (connectorId === "github") {
    const result =
      capability.mode === "read"
        ? await runGithubRead(userId, capabilityId, params)
        : await runGithubWrite(userId, capabilityId, params);

    await audit(
  userId,
  tool,
  result.ok ? "executed" : "failed",
  requiresApproval,
  result.ok ? null : (result.error ?? "failed"),
  params,
  result.ok
    ? ((result.data ?? {}) as Record<string, unknown>)
    : null,
);

    return {
      ok: result.ok,
      status: result.ok ? "executed" : "failed",
      message: result.ok ? "ok" : (result.error ?? "failed"),
      data: result.data,
    };
  }

  // Other connectors' live clients (and GitHub writes) land in later PRs.
  await audit(userId, tool, "failed", requiresApproval, "not_implemented", params);
  return { ok: false, status: "blocked", message: "not_implemented" };
}
