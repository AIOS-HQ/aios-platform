"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAV_ICONS, type NavItem } from "./nav-config";
import { cn } from "@/lib/utils";

export function NavLink({
  item,
  badge,
  onNavigate,
}: {
  item: NavItem;
  /** Optional count shown as a pill on the right (e.g. pending approvals). */
  badge?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = item.exact
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/15 text-primary shadow-sm ring-1 ring-inset ring-primary/20"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
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
