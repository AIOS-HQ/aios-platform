import { requireUser } from "@/lib/auth/user";
import { getProfile } from "@/lib/data/profile";
import { isFounderUser } from "@/lib/auth/roles";
import { listCompanies } from "@/lib/data/os/companies";
import {
  countPendingApprovals,
  countUnreadLifeOperatorMessages,
} from "@/lib/data/os/approvals";
import { countHighRiskPending } from "@/lib/agents/auditor/service";
import { countWorkItems } from "@/lib/data/os/work-items";
import { countUnresolvedOps } from "@/lib/observability/ops";
import { AppShell } from "@/components/app/app-shell";
import { getInitials } from "@/lib/utils";
import { getDownloadUrl } from "@/lib/uploads/storage";

// Authenticated routes read cookies/session — always render dynamically.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  // Founder/admin gate (env allowlist OR DB role `admin`, via @/lib/auth/roles):
  // founders get the Founder OS chrome + governance signals; customers get the
  // Harmony experience and never load founder-only data.
  const isFounder = isFounderUser(user.email, profile?.role);

  const [companies, unreadLifeOperatorMessages] = await Promise.all([
    listCompanies(),
    countUnreadLifeOperatorMessages(),
  ]);

  // Governance signals power founder-only nav badges; skip the queries entirely
  // for customers (they have no Approvals/Operations/Auditor/Work nav).
  const [pendingApprovals, riskCount, stalledWork, opsCount] = isFounder
    ? await Promise.all([
        countPendingApprovals(),
        countHighRiskPending(user.id),
        countWorkItems("blocked"),
        countUnresolvedOps(user.id, "error"),
      ])
    : [0, 0, 0, 0];

  const name =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "User";
  const email = user.email ?? "";
  const initials = getInitials(profile?.full_name?.trim() || email);
  const profilePhotoUrl = profile?.profile_photo_path
    ? await getDownloadUrl(profile.profile_photo_path, 3600)
    : null;

  return (
    <AppShell
      name={name}
      email={email}
      initials={initials}
      profilePhotoUrl={profilePhotoUrl}
      isFounder={isFounder}
      companies={companies.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
      pendingApprovals={pendingApprovals}
      unreadLifeOperatorMessages={unreadLifeOperatorMessages}
      riskCount={riskCount}
      stalledWork={stalledWork}
      opsCount={opsCount}
    >
      {children}
    </AppShell>
  );
}
