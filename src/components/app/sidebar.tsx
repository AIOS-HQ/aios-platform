import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HarmonyMark } from "@/components/brand/harmony-logo";
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
      className="app-sidebar relative z-20 hidden w-64 shrink-0 flex-col border-r text-sidebar-foreground md:flex"
      aria-label={t("sidebar")}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border/70 px-4">
        <Link href={isFounder ? "/harmony" : "/harmony/personal"} aria-label={t("home")} className="inline-flex min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar">
          <HarmonyMark className="size-10" title="Harmony" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label={t("main")}>
        {sections.map((section, i) => (
          <div key={section.titleKey ?? `section-${i}`} className="flex flex-col gap-1.5">
            {section.titleKey && (
              <p className="px-3 pb-1 text-[0.66rem] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/52">
                {t(`sections.${section.titleKey}`)}
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
