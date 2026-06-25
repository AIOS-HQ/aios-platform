import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Check, Plug } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import {
  getDiscoveredChannels,
  getDiscoveredPublishers,
  type DiscoveredConnector,
} from "@/lib/integrations/discovery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Read-only recognition of services connected in the Integration Center.
 * Communications and Content/Catalyst render this so a connector authorized
 * once in the Integration Center is automatically picked up — no second
 * configuration or connect flow. Stays a quiet empty state until a matching
 * connector is connected (most light up once their OAuth is wired), and the
 * single "manage" link points back to the one Integration Center.
 */
export async function DiscoveredConnectors({
  kind,
}: {
  kind: "channels" | "publishers";
}) {
  const user = await requireUser();
  const t = await getTranslations("integrations");
  const items: DiscoveredConnector[] =
    kind === "channels"
      ? await getDiscoveredChannels(user.id)
      : await getDiscoveredPublishers(user.id);

  const titleKey =
    kind === "channels" ? "discovery.channelsTitle" : "discovery.publishersTitle";
  const hintKey =
    kind === "channels" ? "discovery.channelsHint" : "discovery.publishersHint";

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="size-4 text-primary" aria-hidden="true" />
          {t(titleKey)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("discovery.empty")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs font-semibold">
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  {c.externalAccount && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.externalAccount}
                    </span>
                  )}
                </span>
                <Badge className="shrink-0">
                  <Check className="size-3" aria-hidden="true" />
                  {t("status.connected")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t(hintKey)}</p>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/harmony/integrations">{t("discovery.manage")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
