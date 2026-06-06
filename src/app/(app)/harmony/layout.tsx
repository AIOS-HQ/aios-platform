import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CreditCard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/user";
import {
  enforceHubAccess,
  getBillingNotice,
  hubForPath,
  isBillingActive,
  isEnforcementEnabled,
} from "@/lib/billing/enforce";

/**
 * Harmony hub layout — applies plan gating (PR #6) and surfaces a past-due
 * notice. It is completely inert while billing is dormant (Stripe not
 * configured and enforcement off): it does no auth/DB work and renders children
 * unchanged, so existing hub behavior and performance are preserved.
 */
export default async function HarmonyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fast path: do nothing until billing is configured or enforcement is on.
  if (!isEnforcementEnabled() && !isBillingActive()) {
    return <>{children}</>;
  }

  const user = await getCurrentUser();
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";

  // May redirect to /pricing when enforcement is on and the plan is insufficient.
  await enforceHubAccess(hubForPath(pathname), user);

  const notice = await getBillingNotice(user);

  return (
    <>
      {notice === "past_due" ? <PastDueBanner /> : null}
      {children}
    </>
  );
}

async function PastDueBanner() {
  const t = await getTranslations("billing");
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-foreground">
        <CreditCard className="size-4 text-warning" aria-hidden="true" />
        {t("pastDueNotice")}
      </span>
      <Link
        href="/settings"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("pastDueAction")}
      </Link>
    </div>
  );
}
