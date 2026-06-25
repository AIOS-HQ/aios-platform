import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { getConnectedProviderIds } from "@/lib/integrations/connections";
import { GuidedOnboarding } from "@/components/harmony/onboarding/guided-onboarding";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle") };
}

/**
 * Harmony Smart Onboarding — the customer's guided setup. Optimized for a
 * non-technical business owner: Harmony asks about the business, recommends the
 * right integrations, and connects them in minutes. Founders can open it too
 * (for testing/administration). Reads the owner-scoped set of already-connected
 * providers so the wizard reflects real state.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  const connected = await getConnectedProviderIds(user.id);
  return <GuidedOnboarding connectedIds={[...connected]} />;
}
