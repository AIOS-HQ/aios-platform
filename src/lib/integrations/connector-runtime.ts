import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getConnector } from "@/lib/integrations/connectors";
import { isConnectorConfigured } from "@/lib/integrations/connector-config";
import { evaluateConnectorRun, buildConnectorApprovalPayload } from "@/lib/harmony/autonomy/connector-policy";
import { createApprovalPayload } from "@/lib/harmony/autonomy/data-access";
import type { AutonomyLevel } from "@/lib/harmony/autonomy/types";
import { runGithubRead } from "@/lib/integrations/clients/github";
import { runGithubWrite } from "@/lib/integrations/clients/github-write";
import { runVercelRead } from "@/lib/integrations/clients/vercel";

/**
 * Connector capability runtime (Phase 6a).
 *
 * The single owner-scoped entry point for running a connector capability. It
 * records an audit row in `agent_actions` (RLS owner-scoped), routes the
 * approval decision through the Unified Autonomy Policy Engine (routine executes;
 * approval/destructive pause for Founder approval), and refuses to run until the
 * connector is configured. Live GitHub and Vercel clients are routed here through
 * owner-scoped audited execution.
 */

export interface ConnectorRunResult {
  ok: boolean;
  status: "executed" | "pending" | "blocked" | "failed";
  message: string;
  data?: Record<string, unknown>;
  /** Set when the action paused for approval — links to the Review Queue payload. */
  approval_id?: string;
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
  options: { approved?: boolean; autonomyLevel?: AutonomyLevel; companyId?: string | null } = {},
): Promise<ConnectorRunResult> {
  const tool = `connector:${connectorId}.${capabilityId}`;
  const connector = getConnector(connectorId);
  const capability = connector?.capabilities.find((c) => c.id === capabilityId);

  if (!connector || !capability) {
    await audit(userId, tool, "failed", false, "unknown_capability", params);
    return { ok: false, status: "failed", message: "unknown_capability" };
  }

  // Route the connector approval decision through the Unified Autonomy Policy
  // Engine (risk-mapping + autonomy levels) instead of a local risk heuristic,
  // so connector execution shares one source of truth with every other agent.
  const policy = evaluateConnectorRun(capability, options.autonomyLevel);
  const requiresApproval = policy.requiresApproval;

  if (policy.decision === "blocked") {
    await audit(userId, tool, "blocked", requiresApproval, "policy_blocked", params);
    return { ok: false, status: "blocked", message: "policy_blocked" };
  }

  if (requiresApproval && !options.approved) {
    // Persist a resumable approval payload (Review Queue + execution-resumption),
    // alongside the agent_actions audit row.
    const approval = await createApprovalPayload(
      userId,
      options.companyId ?? null,
      buildConnectorApprovalPayload(connectorId, capabilityId, params, policy),
    );
    await audit(
      userId,
      tool,
      "pending",
      true,
      policy.destructive ? "destructive" : null,
      params,
    );
    return {
      ok: true,
      status: "pending",
      approval_id: approval?.approval_id,
      message: policy.destructive ? "needs_approval_destructive" : "needs_approval",
    };
  }

  if (!isConnectorConfigured(connector)) {
    await audit(userId, tool, "failed", requiresApproval, "not_configured", params);
    return { ok: false, status: "blocked", message: "not_configured" };
  }

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
      result.ok ? ((result.data ?? {}) as Record<string, unknown>) : null,
    );

    return {
      ok: result.ok,
      status: result.ok ? "executed" : "failed",
      message: result.ok ? "ok" : (result.error ?? "failed"),
      data: result.data,
    };
  }

  if (connectorId === "vercel" && capability.mode === "read") {
    const result = await runVercelRead(userId, capabilityId, params);

    await audit(
      userId,
      tool,
      result.ok ? "executed" : "failed",
      requiresApproval,
      result.ok ? null : (result.error ?? "failed"),
      params,
      result.ok ? ((result.data ?? {}) as Record<string, unknown>) : null,
    );

    return {
      ok: result.ok,
      status: result.ok ? "executed" : "failed",
      message: result.ok ? "ok" : (result.error ?? "failed"),
      data: result.data,
    };
  }

  await audit(userId, tool, "failed", requiresApproval, "not_implemented", params);
  return { ok: false, status: "blocked", message: "not_implemented" };
}
