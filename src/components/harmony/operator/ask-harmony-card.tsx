import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HarmonyMark } from "@/components/brand/harmony-logo";
import { OperatorQuickInput } from "./operator-quick-input";

/**
 * "Ask Harmony" entry point — Harmony's presence on the customer's tool pages
 * (tasks, goals, notes). Reuses the Harmony quick input so the customer can ask
 * Harmony for anything in context, reinforcing that Harmony — the AI Chief of
 * Staff — owns the experience end to end rather than each tool being a
 * standalone app. Pulls copy from the shared `operator` (Harmony) namespace, so
 * no new strings are introduced.
 */
export async function AskHarmonyCard() {
  const t = await getTranslations("operator");
  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HarmonyMark className="size-4" title="Harmony" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <OperatorQuickInput />
      </CardContent>
    </Card>
  );
}
