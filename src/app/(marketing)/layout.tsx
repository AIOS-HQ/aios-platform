import type { ReactNode } from "react";
import { PublicNavbar } from "@/components/marketing/public-navbar";
import { PublicFooter } from "@/components/marketing/public-footer";

/**
 * Public marketing layout — wraps every page in the (marketing) route group
 * with the shared public navbar + footer. Nests inside the root layout
 * (html/body/intl provider), so it never affects the Command Center (which
 * lives in the (app) group with its own sidebar layout) or the auth routes.
 *
 * Route-group layout => the URLs are unchanged (no "/marketing" prefix). New
 * public pages added under src/app/(marketing)/ automatically inherit this
 * chrome.
 *
 * TODO(codex): the existing landing (/) and /pricing live OUTSIDE this group,
 * so they don't yet render this navbar/footer. Either move them into
 * (marketing) to unify the chrome, or render <PublicNavbar/> + <PublicFooter/>
 * within them. See docs/PUBLIC_WEBSITE.md.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
