import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { navSections } from "./nav-config";
import { NavLink } from "./nav-link";

/** Persistent desktop sidebar (Founder OS). */
export async function Sidebar({
  badges,
}: {
  /** Map of nav href → badge count (e.g. pending approvals). */
  badges?: Record<string, number>;
}) {
  const t = await getTranslations("nav.sections");
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex"
      aria-label="Application sidebar"
    >
      <div className="flex h-16 items-center px-5">
        <Link href="/harmony" aria-label="AIOS home">
          <Logo />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3" aria-label="Main">
        {navSections.map((section, i) => (
          <div key={section.titleKey ?? `section-${i}`} className="flex flex-col gap-1">
            {section.titleKey && (
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {t(section.titleKey)}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} badge={badges?.[item.href]} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
