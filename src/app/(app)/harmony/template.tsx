import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CreditCard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { isFounderHarmonyPath } from "@/components/app/nav-config";
import {
  enforceHubAccess,
  getBillingNotice,
  hubForPath,
  isBillingActive,
  isEnforcementEnabled,
} from "@/lib/billing/enforce";

/**
 * Per-navigation Harmony hub template. Two responsibilities:
 *
 * 1. Founder OS gate — customers experience Harmony (the AI Chief of Staff) and
 *    never the Command Center / governance surfaces. Non-founders hitting a
 *    Founder OS route are routed to their Harmony home. Always runs.
 * 2. Plan gating (PR #6) — applies billing hub access + a past-due notice. Inert
 *    while billing is dormant (Stripe not configured and enforcement off).
 */
export default async function HarmonyTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";

  // (1) Founder OS gate — runs regardless of billing state.
  if (isFounderHarmonyPath(pathname) && !(await currentUserIsAdmin())) {
    redirect("/harmony/personal");
  }

  // (2) Fast path: do nothing further until billing is configured or enforced.
  if (!isEnforcementEnabled() && !isBillingActive()) {
    return <>{children}</>;
  }

  const user = await getCurrentUser();

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
