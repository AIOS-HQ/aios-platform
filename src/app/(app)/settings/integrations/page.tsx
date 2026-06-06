import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
} from "@/lib/integrations/catalog";
import { isProviderConfigured } from "@/lib/integrations/config";
import { getConnectedProviderIds } from "@/lib/integrations/connections";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisconnectButton } from "@/components/integrations/disconnect-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("integrations");
  return { title: t("title") };
}

export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const user = await requireUser();
  const connected = await getConnectedProviderIds(user.id);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-8">
        {INTEGRATION_CATEGORIES.map((cat) => {
          const items = INTEGRATIONS.filter((p) => p.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`categories.${cat}`)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((p) => {
                  const isConnected = connected.has(p.id);
                  const configured = isProviderConfigured(p);
                  return (
                    <Card key={p.id}>
                      <CardContent className="flex items-center justify-between gap-4 p-5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted text-sm font-bold">
                            {p.initials}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold">{p.name}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {t(`providers.${p.id}`)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isConnected ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="success">{t("status.connected")}</Badge>
                              <DisconnectButton
                                provider={p.id}
                                label={t("actions.disconnect")}
                                errorLabel={t("actions.error")}
                              />
                            </div>
                          ) : p.auth === "api_key" ? (
                            <Badge variant={configured ? "success" : "outline"}>
                              {configured ? t("status.active") : t("status.comingSoon")}
                            </Badge>
                          ) : configured ? (
                            <Button asChild size="sm">
                              <a href={`/api/integrations/${p.id}/connect`}>
                                {t("actions.connect")}
                              </a>
                            </Button>
                          ) : (
                            <Badge variant="outline">{t("status.comingSoon")}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 max-w-2xl text-sm text-muted-foreground">{t("note")}</p>
    </>
  );
}
