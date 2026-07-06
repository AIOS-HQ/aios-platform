import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/user";
import { getConnectorHealth } from "@/lib/integrations/connector-health";
import { getConnections } from "@/lib/integrations/connections";
import { listConnectorDefinitions } from "@/lib/integrations/registry";
import { connectAffordanceFor, connectHref } from "@/lib/integrations/connect-gate";
import { PageHeader } from "@/components/shared/page-header";
import { IntegrationCenter, type ConnectorView } from "./integration-center";

export const metadata: Metadata = { title: "Integration Center" };

/**
 * AIOS Integration Center — the founder's live operating view of every
 * connector: health, security (token encryption), token expiry / auto-refresh,
 * OAuth status, recommended actions, plus connect affordances for providers not
 * yet connected. Read-only consumer of the EXISTING backend — connector health
 * service (getConnectorHealth), the unified registry, connect-gate — with zero
 * backend changes. Founder-gated via the /harmony layout.
 */

const STATE_SCORE: Record<string, number> = {
  healthy: 100,
  expired_refreshable: 85,
  plaintext_token: 65,
  needs_reauth: 30,
  setup_required: 0,
  unknown: 50,
};

export default async function IntegrationCenterPage() {
  const user = await requireUser();

  const [health, connections] = await Promise.all([
    getConnectorHealth(user.id),
    getConnections(user.id),
  ]);

  const defs = listConnectorDefinitions();
  const healthByProvider = new Map(health.map((h) => [h.provider, h]));
  const connByProvider = new Map(connections.map((c) => [c.provider, c]));

  const items: ConnectorView[] = defs.map((def) => {
    const h = healthByProvider.get(def.id);
    const conn = connByProvider.get(def.id);
    const connected = (conn?.status ?? "") === "connected";
    const isExpired = h?.isExpired ?? false;

    return {
      id: def.id,
      name: def.name,
      category: def.category,
      initials: def.initials,
      auth: def.auth,
      oauthFamily: def.oauthFamily ?? null,
      docsUrl: def.docsUrl,
      scopeCount: def.scopes?.length ?? 0,
      authorizable: def.authorizable,
      connected,
      state: h?.state ?? null,
      status: h?.status ?? (connected ? "connected" : "not_connected"),
      tokenEncryption: h?.tokenEncryption ?? null,
      hasRefreshToken: h?.hasRefreshToken ?? false,
      refreshable: h?.refreshable ?? false,
      expiresAt: h?.expiresAt ?? null,
      isExpired,
      lastRefresh: h?.lastRefresh ?? null,
      connectedAt: h?.connectedAt ?? null,
      recommendedAction: h?.recommendedAction ?? null,
      healthScore: h ? (STATE_SCORE[h.state] ?? 50) : null,
      affordance: connectAffordanceFor(def.id, { connected, expired: isExpired }),
      connectHref: connectHref(def.id),
    };
  });

  const connectedItems = items.filter((i) => i.connected);
  const overallHealth = connectedItems.length
    ? Math.round(
        connectedItems.reduce((sum, i) => sum + (i.healthScore ?? 0), 0) / connectedItems.length,
      )
    : null;

  return (
    <>
      <PageHeader
        title="Integration Center"
        description="Live health, security, and status for every AIOS connector — from one dashboard."
      />
      <IntegrationCenter
        items={items}
        overallHealth={overallHealth}
        generatedAt={new Date().toISOString()}
      />
    </>
  );
}
