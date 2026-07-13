import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { sectionsForAudience } from "./nav-config";
import { NavLink } from "./nav-link";

/**
 * Persistent desktop sidebar. Founders see the full Founder OS; customers see
 * the Harmony experience (personal hub + settings). Harmony is the brand in the
 * chrome — the customer's AI Chief of Staff.
 */
export async function Sidebar({
  badges,
  isFounder = false,
}: {
  /** Map of nav href → badge count (e.g. pending approvals). */
  badges?: Record<string, number>;
  /** Founder/admin sees the Founder OS command group. */
  isFounder?: boolean;
}) {
  const t = await getTranslations("nav");
  const sections = sectionsForAudience(isFounder);
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
      aria-label={t("sidebar")}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border/70 px-4">
        <Link href="/harmony" aria-label={t("home")} className="inline-flex min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar">
          <AiosHarmonyLogo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label={t("main")}>
        {sections.map((section, i) => (
          <div key={section.titleKey ?? `section-${i}`} className="flex flex-col gap-1.5">
            {section.titleKey && (
              <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.13em] text-sidebar-foreground/65">
                {t(`sections.${section.titleKey}`)}
              </p>
            )}
            {section.items.map((item) => (
              <div key={item.href} className="space-y-1">
                <NavLink item={item} badge={badges?.[item.href]} />
                {item.children?.map((child) => (
                  <NavLink
                    key={child.href}
                    item={child}
                    badge={badges?.[child.href]}
                    depth={1}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
