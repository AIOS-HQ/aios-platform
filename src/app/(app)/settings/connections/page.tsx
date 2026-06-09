import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Plug } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getConnections } from "@/lib/integrations/connections";
import { getIntegration } from "@/lib/integrations/catalog";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisconnectButton } from "@/components/integrations/disconnect-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("connections");
  return { title: t("title") };
}

const STATUS_VARIANT: Record<
  string,
  "success" | "secondary" | "outline" | "destructive"
> = {
  connected: "success",
  expired: "outline",
  error: "destructive",
  revoked: "secondary",
  disconnected: "secondary",
};

/**
 * Connection dashboard — the "what's connected right now" companion to the
 * provider catalog at /settings/integrations. Owner-scoped: reads go through
 * getConnections (RLS, token columns never selected). Reconnect re-runs the
 * existing OAuth connect route; disconnect reuses the shared DisconnectButton.
 */
export default async function ConnectionsPage() {
  const t = await getTranslations("connections");
  const user = await requireUser();
  const locale = await getLocale();
  const connections = await getConnections(user.id);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        {connections.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <EmptyState
              icon={Plug}
              title={t("empty.title")}
              description={t("empty.description")}
            />
            <Button asChild variant="outline" size="sm">
              <a href="/settings/integrations">{t("browseCta")}</a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {connections.map((c) => {
              const meta = getIntegration(c.provider);
              const name = meta?.name ?? c.provider;
              const initials = meta?.initials ?? name.slice(0, 2).toUpperCase();
              const isOauth = meta?.auth === "oauth2";
              const scopeCount = c.scopes
                ? c.scopes.split(/[ ,]+/).filter(Boolean).length
                : 0;
              const statusKey = c.status in STATUS_VARIANT ? c.status : "connected";
              return (
                <Card key={c.provider}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-bold">
                        {initials}
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{name}</p>
                          <Badge variant={STATUS_VARIANT[statusKey]}>
                            {t(`status.${statusKey}`)}
                          </Badge>
                        </div>
                        {c.external_account ? (
                          <p className="truncate text-sm text-muted-foreground">
                            {t("accountLabel", { account: c.external_account })}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {t("connectedLabel", {
                            date: formatDate(c.created_at, locale),
                          })}
                          {scopeCount > 0
                            ? ` · ${t("scopesLabel", { count: scopeCount })}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isOauth ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={`/api/integrations/${c.provider}/connect`}>
                            {t("reconnect")}
                          </a>
                        </Button>
                      ) : null}
                      <DisconnectButton
                        provider={c.provider}
                        label={t("disconnect")}
                        errorLabel={t("disconnectError")}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
