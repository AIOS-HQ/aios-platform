"use server";

import { requireUser } from "@/lib/auth/user";
import { resolvePrimaryCompanyId, juliusRemember } from "@/lib/julius/wiring";
import {
  recommendConnectors,
  type BusinessProfile,
} from "@/lib/integrations/onboarding";

/**
 * Persist the Smart Onboarding business profile to Julius (the single Company
 * Brain) so Harmony and the workforce understand the business from day one.
 * Best-effort and fail-open: enriches the org brain via the standard
 * juliusRemember path (no new table/migration). No-op for users without a
 * company. Reuses the recommendation engine for the recorded summary.
 */
export async function saveOnboardingProfile(
  profile: BusinessProfile,
): Promise<{ ok: boolean }> {
  try {
    const user = await requireUser();
    const companyId = await resolvePrimaryCompanyId();
    if (!companyId) return { ok: false };

    const recommended = recommendConnectors(profile);
    const content = [
      `Business type: ${profile.businessType}`,
      profile.employees ? `Employees: ${profile.employees}` : null,
      profile.contactChannels.length
        ? `Customer channels: ${profile.contactChannels.join(", ")}`
        : null,
      `Uses a CRM: ${profile.usesCrm ? "yes" : "no"}`,
      `Accepts online payments: ${profile.acceptsPayments ? "yes" : "no"}`,
      `Has office devices: ${profile.hasDevices ? "yes" : "no"}`,
      profile.languages.length ? `Customer languages: ${profile.languages.join(", ")}` : null,
      profile.aiProviders.length ? `AI providers: ${profile.aiProviders.join(", ")}` : null,
      `Recommended integrations: ${recommended.join(", ") || "none"}`,
    ]
      .filter(Boolean)
      .join("\n");

    await juliusRemember({
      userId: user.id,
      companyId,
      agent: "harmony",
      kind: "context",
      title: "Business profile (Smart Onboarding)",
      content,
      importance: 4,
      refs: { kind: "onboarding_profile" },
    });
    return { ok: true };
  } catch (e) {
    console.error("[onboarding] saveOnboardingProfile", e);
    return { ok: false };
  }
}
