import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Plug, ShieldCheck, ArrowUpRight, ChevronDown, Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import {
  listConnectors,
  countCapabilities,
  CONNECTOR_CATEGORIES,
  type ConnectorCategory,
} from "@/lib/integrations/connectors";
import { getConnections } from "@/lib/integrations/connections";
import { connectAffordanceFor } from "@/lib/integrations/connect-gate";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectorGlyph } from "@/components/brand/brand-icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("integrations");
  return { title: t("title") };
}

type ConnStatus = "connected" | "expired" | "available" | "comingSoon";

const STATUS_VARIANT: Record<ConnStatus, "default" | "secondary" | "outline" | "destructive"> = {
  connected: "default",
  expired: "destructive",
  available: "secondary",
  comingSoon: "outline",
};

/**
 * AIOS Integration Center — securely connect AIOS to external systems.
 *
 * This is the founder's connection layer. It is NOT a communications or content
 * tool: Communications operates customer conversations and Content publishes
 * marketing — both CONSUME the services connected here. Reads the connector
 * framework (registry) and the owner-scoped connection state (status,
 * permissions, health, audit). OAuth is used wherever a connector is wired;
 * advanced per-key configuration is intentionally not surfaced here.
 *
 * Stage 1c: the Connect action is gated by the dev_configured invariant
 * (connectAffordanceFor) — a provider that is wired for OAuth but not yet
 * developer-configured shows a "Finish setup" path to the Developer Platform
 * instead of a live Connect that would fail. Gated behind CONNECTOR_GATE_ENABLED.
 *
 * Founder-gated: lives under /harmony and is not a customer prefix, so
 * isFounderHarmonyPath keeps it founder-only.
 */
export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const locale = await getLocale();
  const user = await requireUser();

  const connectors = listConnectors();
  const connections = await getConnections(user.id);
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const now = new Date().getTime();

  const connectedCount = connections.filter((c) => c.status === "connected").length;

  const categories = CONNECTOR_CATEGORIES.filter((cat) =>
    connectors.some((c) => c.category === cat),
  );

  function statusOf(id: string, authorizable: boolean | undefined): ConnStatus {
    const conn = byProvider.get(id);
    const connected = conn?.status === "connected";
    if (connected) {
      const expired = conn?.expires_at
        ? new Date(conn.expires_at).getTime() < now
        : false;
      return expired ? "expired" : "connected";
    }
    return authorizable ? "available" : "comingSoon";
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-5xl">
        {/* What Integrations is (and is not). */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">{t("introTitle")}</p>
              <p className="text-muted-foreground">{t("intro")}</p>
              <p className="text-xs text-muted-foreground">
                {t("connectedSummary", { n: connectedCount })}
              </p>
            </div>
          </CardContent>
        </Card>

        {categories.map((category) => {
          const items = connectors.filter((c) => c.category === category);
          return (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`category.${category}` as `category.${ConnectorCategory}`)}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => {
                  const conn = byProvider.get(c.id);
                  const status = statusOf(c.id, c.authorizable);
                  const caps = countCapabilities(c);
                  const affordance = connectAffordanceFor(c.id, {
                    connected: status === "connected",
                    expired: status === "expired",
                  });
                  const canConnect = affordance === "connect" || affordance === "reauthorize";
                  const finishSetup = affordance === "finish_setup";
                  const cardContent = (
                    <>
                      <CardHeader className="flex-row items-center gap-3 space-y-0">
                        <ConnectorGlyph id={c.id} initials={c.initials} />
                        <div className="min-w-0 flex-1">
                          <CardTitle className="truncate text-base">{c.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {t(`auth.${c.auth}`)}
                          </CardDescription>
                        </div>
                        {finishSetup ? (
                          <Badge variant="outline" className="shrink-0">Setup required</Badge>
                        ) : (
                          <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
                            {t(`status.${status}`)}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs text-muted-foreground">
                        {caps.read + caps.write > 0 ? (
                          <p>{t("capabilities", { read: caps.read, write: caps.write })}</p>
                        ) : (
                          <p>{t("noCapabilitiesYet")}</p>
                        )}

                        {status === "connected" && conn?.connected_at ? (
                          <p>{t("lastConnected", { date: formatDate(conn.connected_at, locale) })}</p>
                        ) : null}
                        {status === "expired" ? (
                          <p className="text-destructive">{t("expiredHint")}</p>
                        ) : null}
                        {finishSetup ? (
                          <p>Developer setup required before this connector can be authorized.</p>
                        ) : null}
                      </CardContent>
                    </>
                  );

                  return (
                    <Card
                      key={c.id}
                      className="group overflow-hidden transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-within:border-primary/40"
                    >
                      {canConnect ? (
                        <a
                          href={`/api/integrations/${c.id}/connect`}
                          aria-label={`${status === "expired" ? t("reauthorize") : t("connect")}: ${c.name}`}
                          className="block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {cardContent}
                        </a>
                      ) : finishSetup ? (
                        <div>{cardContent}</div>
                      ) : (
                        <details>
                          <summary className="cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                            {cardContent}
                            <div className="flex items-center gap-1 px-6 pb-4 text-xs font-medium text-primary">
                              {status === "connected" ? t("manage") : t("viewSetup")}
                              <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />
                            </div>
                          </summary>
                          <div className="border-t bg-muted/30 px-6 py-4 text-xs text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {status === "connected" ? t("detailsTitle", { name: c.name }) : t("setupTitle", { name: c.name })}
                            </p>
                            <p className="mt-1">
                              {status === "connected" ? t("detailsHint") : t("setupHint")}
                            </p>
                            <a
                              href={c.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center gap-1 text-primary transition-colors hover:text-primary/80"
                            >
                              {t("docs")}
                              <ArrowUpRight className="size-3" aria-hidden="true" />
                            </a>
                          </div>
                        </details>
                      )}

                      {canConnect ? (
                        <div className="flex flex-wrap items-center gap-2 px-6 pb-4 text-xs text-muted-foreground">
                          <Button asChild size="sm" className="h-7 px-2 text-xs">
                            <a href={`/api/integrations/${c.id}/connect`}>
                              <Plug className="size-3.5" aria-hidden="true" />
                              {status === "expired" ? t("reauthorize") : t("connect")}
                            </a>
                          </Button>
                          <a
                            href={c.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {t("docs")}
                            <ArrowUpRight className="size-3" aria-hidden="true" />
                          </a>
                        </div>
                      ) : finishSetup ? (
                        <div className="flex flex-wrap items-center gap-2 px-6 pb-4 text-xs text-muted-foreground">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled>
                            <Plug className="size-3.5" aria-hidden="true" />
                            {t("connect")}
                          </Button>
                          <Link
                            href="/harmony/developer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                          >
                            <Wrench className="size-3" aria-hidden="true" />
                            Finish setup in Developer Platform
                          </Link>
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
