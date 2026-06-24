import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { CompanySwitcher } from "@/components/harmony/os/company-switcher";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

/** Authenticated application chrome: sidebar + top bar + content region. */
export function AppShell({
  name,
  email,
  initials,
  companies,
  pendingApprovals = 0,
  unreadLifeOperatorMessages = 0,
  riskCount = 0,
  stalledWork = 0,
  opsCount = 0,
  children,
}: {
  name: string;
  email: string;
  initials: string;
  companies: { id: string; name: string; slug: string }[];
  /** Pending approvals count → rendered as a nav badge on Approvals. */
  pendingApprovals?: number;
  unreadLifeOperatorMessages?: number;
  /** High-risk actions awaiting approval → risk badge on the Auditor nav item. */
  riskCount?: number;
  /** Blocked/stalled work items → bottleneck badge on the Work nav item. */
  stalledWork?: number;
  /** Unresolved operational errors → badge on the Operations nav item. */
  opsCount?: number;
  children: React.ReactNode;
}) {
  const navBadges: Record<string, number> = {};

  if (pendingApprovals > 0) {
    navBadges["/harmony/approvals"] = pendingApprovals;
  }

  if (unreadLifeOperatorMessages > 0) {
    navBadges["/harmony/operator"] = unreadLifeOperatorMessages;
  }

  if (riskCount > 0) {
    navBadges["/settings/auditor"] = riskCount;
  }

  if (stalledWork > 0) {
    navBadges["/harmony/work"] = stalledWork;
  }

  if (opsCount > 0) {
    navBadges["/harmony/operations"] = opsCount;
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar badges={navBadges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <MobileNav badges={navBadges} />
          <CompanySwitcher companies={companies} />
          <div className="flex-1" />
          <div className="hidden sm:block">
            <LocaleSwitcher />
          </div>
          <ThemeToggle />
          <UserMenu name={name} email={email} initials={initials} />
        </header>
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
