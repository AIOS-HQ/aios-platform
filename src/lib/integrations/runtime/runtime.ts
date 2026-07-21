import "server-only";

import { getConnectorDefinition } from "@/lib/integrations/registry";
import { isDevConfigured } from "@/lib/integrations/registry-status";
import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import { getConnections } from "@/lib/integrations/connections";
import { redactSecret } from "@/lib/integrations/secret-redaction";
import { getCapability, capabilityPermission } from "./capabilities";
import { withRetry } from "./retry";
import { getTelemetrySink } from "./telemetry";
import type {
  CapabilityContext,
  CapabilityHandler,
  CapabilityOutcome,
  CapabilityResult,
} from "./types";

/**
 * The Universal Capability Runtime.
 *
 * Every connector inherits this ONE execution path:
 *   load → configuration → permission (governance) → connection/auth →
 *   execute (retry) → telemetry/audit → recovery.
 *
 * Governance is inherited, not reinvented: `capabilityPermission` maps the
 * capability's risk class to the required authorization, and the caller's
 * `authorize` hook (owned by the Autonomy Spine) decides. Handlers register
 * per (connector, capability) and are supplied a valid access token, so no
 * provider re-implements auth, retry, or observability.
 */

const HANDLERS = new Map<string, CapabilityHandler>();
const CONFIG_OPTIONAL_FALLBACK_READS = new Set([
  "vercel:deployment_status",
  "vercel:production_url_verification",
  "vercel:build_status",
  "vercel:list_deployments",
]);

function handlerKey(connectorId: string, capabilityId: string): string {
  return `${connectorId}:${capabilityId}`;
}

export function registerCapabilityHandler<I, O>(
  connectorId: string,
  capabilityId: string,
  handler: CapabilityHandler<I, O>,
): void {
  HANDLERS.set(handlerKey(connectorId, capabilityId), handler as CapabilityHandler);
}

export function hasCapabilityHandler(connectorId: string, capabilityId: string): boolean {
  return HANDLERS.has(handlerKey(connectorId, capabilityId));
}

export async function executeCapability<I = unknown, O = unknown>(
  ctx: CapabilityContext<I>,
): Promise<CapabilityResult<O>> {
  const started = Date.now();
  const { connectorId, capabilityId, userId } = ctx;

  const finish = (
    outcome: CapabilityOutcome,
    extra: Partial<CapabilityResult<O>> = {},
  ): CapabilityResult<O> => {
    const attempts = extra.attempts ?? 0;
    const durationMs = Date.now() - started;
    void Promise.resolve(
      getTelemetrySink().record({
        type: "capability_invocation",
        connectorId,
        capabilityId,
        userId,
        outcome,
        attempts,
        durationMs,
        correlationId: ctx.correlationId,
        at: new Date().toISOString(),
      }),
    ).catch(() => {
      /* telemetry must never break execution */
    });
    return {
      connectorId,
      capabilityId,
      correlationId: ctx.correlationId,
      outcome,
      attempts,
      durationMs,
      ...extra,
    };
  };

  const def = getConnectorDefinition(connectorId);
  const cap = getCapability(connectorId, capabilityId);
  if (!def || !cap) {
    return finish("not_implemented", {
      error: { code: "unknown_capability", message: "Unknown connector or capability", retryable: false },
    });
  }

  // Configuration (dev_configured invariant).
  if (!isDevConfigured(def) && !CONFIG_OPTIONAL_FALLBACK_READS.has(handlerKey(connectorId, capabilityId))) {
    return finish("not_configured", {
      error: { code: "not_configured", message: "Developer configuration incomplete", retryable: false },
    });
  }

  // Permission (governance inherited from risk class).
  const permission = capabilityPermission(cap);
  if (permission !== "autonomous") {
    const authorized = ctx.authorize
      ? await ctx.authorize({ ref: { connectorId, capabilityId }, permission, risk: cap.risk ?? "approval" })
      : false;
    if (!authorized) {
      return finish("requires_approval", {
        error: { code: permission, message: `Capability requires ${permission}`, retryable: false },
      });
    }
  }

  // Connection + auth (OAuth connectors).
  let accessToken: string | null = null;
  if (def.auth === "oauth2") {
    const connections = await getConnections(userId);
    const conn = connections.find((c) => c.provider === connectorId);
    if (!conn || conn.status !== "connected") {
      return finish("not_connected", {
        error: { code: "not_connected", message: "Connector is not connected", retryable: false },
      });
    }
    accessToken = def.oauthFamily
      ? await getValidAccessToken(userId, connectorId, def.oauthFamily)
      : null;
    if (!accessToken) {
      return finish("not_connected", {
        error: { code: "no_token", message: "No valid access token (reauthorization may be required)", retryable: false },
      });
    }
  }

  // Execution runtime + retry + recovery.
  const handler = HANDLERS.get(handlerKey(connectorId, capabilityId));
  if (!handler) {
    return finish("not_implemented", {
      error: { code: "no_handler", message: "No capability handler registered", retryable: false },
    });
  }

  const { value, error, attempts } = await withRetry<O>(
    () =>
      handler({ userId, connectorId, capabilityId, input: ctx.input, accessToken }) as Promise<O>,
    ctx.retry,
  );

  if (error) {
    const message = error instanceof Error ? redactSecret(error) : "Capability execution failed";
    return finish("error", { attempts, error: { code: "execution_failed", message, retryable: false } });
  }
  return finish("success", { attempts, data: value });
}
