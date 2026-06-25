import { getTranslations } from "next-intl/server";
import { Headphones, MessageSquare, ShieldCheck } from "lucide-react";
import { getDiscoveredChannels } from "@/lib/integrations/discovery";
import { getConnector } from "@/lib/integrations/connectors";
import {
  AMBASSADOR_CHANNELS,
  AMBASSADOR_HIGH_RISK_TOPICS,
  AMBASSADOR_RECEPTIONIST,
  type AmbassadorChannel,
} from "@/lib/workforce/ambassador";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ChannelStatus = "connected" | "available" | "comingSoon" | "native" | "future";

const STATUS_VARIANT: Record<ChannelStatus, "success" | "default" | "secondary" | "outline"> = {
  connected: "success",
  available: "default",
  native: "secondary",
  comingSoon: "outline",
  future: "outline",
};

/**
 * Ambassador's Business Communications profile — shown on the Ambassador agent
 * page only. Reads live channel connection state from the Integration Center
 * and presents the communication-safety policy and virtual-receptionist role.
 * Self-gating: renders nothing for any other agent.
 */
export async function AmbassadorCommsCard({
  agentKey,
  userId,
}: {
  agentKey: string;
  userId: string;
}) {
  if (agentKey !== "ambassador") return null;

  const t = await getTranslations("ambassador");
  const tk = await getTranslations("os.channelKind");
  const discovered = await getDiscoveredChannels(userId);
  const connectedIds = new Set(discovered.map((d) => d.id));

  function channelStatus(ch: AmbassadorChannel): ChannelStatus {
    if (ch.future) return "future";
    if (ch.native) return "native";
    if (ch.connectorId && connectedIds.has(ch.connectorId)) return "connected";
    if (ch.connectorId && getConnector(ch.connectorId)?.authorizable) return "available";
    return "comingSoon";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-primary" aria-hidden="true" />
          {t("commsTitle")}
        </CardTitle>
        <CardDescription>{t("commsSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Channels */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("channelsTitle")}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {AMBASSADOR_CHANNELS.map((ch) => {
              const st = channelStatus(ch);
              const label = ch.labelKind ? tk(ch.labelKind) : t(ch.labelKey ?? ch.id);
              return (
                <li
                  key={ch.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
                >
                  <span className="truncate text-sm">{label}</span>
                  <Badge variant={STATUS_VARIANT[st]} className="shrink-0">
                    {t(`status.${st}`)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Communication safety policy */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("policyTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("policyAuto")}</p>
          <p className="mt-2 text-sm">{t("policyApproval")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AMBASSADOR_HIGH_RISK_TOPICS.map((topic) => (
              <Badge key={topic} variant="outline">{t(`topic.${topic}`)}</Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("policyEscalate")}</p>
        </div>

        {/* Virtual receptionist */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Headphones className="size-3.5" aria-hidden="true" />
            {t("receptionistTitle")}
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {AMBASSADOR_RECEPTIONIST.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {t(`receptionist.${r}`)}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
