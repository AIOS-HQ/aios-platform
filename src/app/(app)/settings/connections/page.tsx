import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { formatDate } from "@/lib/format";
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  countCapabilities,
} from "@/lib/integrations/connectors";
import { getConnectorStatus } from "@/lib/integrations/connector-config";
import { getProviderHealth } from "@/lib/integrations/connector-health";
import { getConnections } from "@/lib/integrations/connections";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisconnectButton } from "@/components/integrations/disconnect-button";
import { LinkedInPublisherCard } from "@/components/integrations/linkedin-publisher-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("connections");
  return { title: t("title") };
}

const STATUS_VARIANT: Record<
  string,
  "success" | "secondary" | "outline" | "destructive"
> = {
  connected: "success",
  ready: "outline",
  expired: "destructive",
  not_connected: "secondary",
};

/**
 * Connections dashboard — every connector with its current status
 * (Not Connected / Ready for Authorization / Connected / Authorization Expired)
 * and capability summary. Owner-scoped: connection rows come from getConnections
 * (RLS, token columns never selected). No live OAuth is initiated here — write
 * actions and authorization are founder-gated.
 */
export default async function ConnectionsPage() {
  const t = await getTranslations("connections");
  const locale = await getLocale();
  const user = await requireUser();
  const connections = await getConnections(user.id);
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const healthEntries = await Promise.all(
    CONNECTORS.map(async (connector) => [connector.id, await getProviderHealth(user.id, connector.id)] as const),
  );
  const healthByProvider = new Map(healthEntries);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-8 lg:max-w-3xl">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            LinkedIn Publishing
          </h2>
          <LinkedInPublisherCard />
        </section>

        {CONNECTOR_CATEGORIES.map((cat) => {
          const items = CONNECTORS.filter((c) => c.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`categories.${cat}`)}
              </h2>
              <div className="flex flex-col gap-3">
                {items.map((c) => {
                  const connection = byProvider.get(c.id);
                  const health = healthByProvider.get(c.id);
                  const status = getConnectorStatus(c, connection);
                  const caps = countCapabilities(c);
                  const implementedCount = health
                    ? Object.values(health.capabilities).filter(Boolean).length
                    : 0;
                  return (
                    <Card key={c.id}>
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-bold">
                            {c.initials}
                          </span>
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-semibold">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("capabilitiesLabel", {
                                read: caps.read,
                                write: caps.write,
                              })}
                            </p>
                            {connection?.external_account ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {t("accountLabel", {
                                  account: connection.external_account,
                                })}
                              </p>
                            ) : null}
                            {connection?.connected_at ? (
                              <p className="text-xs text-muted-foreground">
                                {t("connectedLabel", {
                                  date: formatDate(connection.connected_at, locale),
                                })}
                              </p>
                            ) : null}
                            {health ? (
                              <p className="text-xs text-muted-foreground">
                                {health.healthy
                                  ? "Health verified"
                                  : health.blockers[0] ?? health.warnings[0] ?? "Health check needs attention"}
                                {implementedCount > 0 ? ` · ${implementedCount} implemented` : ""}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
                            {t(`status.${status}`)}
                          </Badge>
                          {c.authorizable && (status === "ready" || status === "expired") ? (
                            <Button asChild size="sm">
                              <a href={`/api/integrations/${c.id}/connect`}>
                                {status === "expired" ? t("reconnect") : t("authorize")}
                              </a>
                            </Button>
                          ) : null}
                          {connection ? (
                            <DisconnectButton
                              provider={c.id}
                              label={t("disconnect")}
                              errorLabel={t("disconnectError")}
                            />
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}

        <p className="text-sm text-muted-foreground">{t("approvalNote")}</p>
      </div>
    </>
  );
}
