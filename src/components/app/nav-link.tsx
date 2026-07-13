"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { isNavItemActive, NAV_ICONS, type NavItem } from "./nav-config";
import { cn } from "@/lib/utils";

export function NavLink({
  item,
  badge,
  onNavigate,
  depth = 0,
}: {
  item: NavItem;
  /** Optional count shown as a pill on the right (e.g. pending approvals). */
  badge?: number;
  onNavigate?: () => void;
  depth?: number;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = isNavItemActive(pathname, item);
  const current = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  // Resolve the icon key → component here (client side), so the Server Sidebar
  // never passes a function across the Server/Client boundary.
  const Icon = NAV_ICONS[item.icon];
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        depth > 0 && "ml-7 min-h-8 py-1.5 text-[0.82rem]",
        active && depth === 0
          ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-primary/30"
          : active
            ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
            : "text-sidebar-foreground/78 hover:bg-background/65 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          depth > 0 && "size-3.5",
          active && depth === 0
            ? "text-primary-foreground"
            : active
              ? "text-primary"
              : "text-sidebar-foreground/58",
        )}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{t(item.labelKey)}</span>
      {showBadge && (
        <span
          className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground"
          aria-label={t("pendingCount", { count: badge })}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}
