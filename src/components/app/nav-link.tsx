"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";
import { isNavItemActive, NAV_ICONS, type NavItem } from "./nav-config";
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
  const active = isNavItemActive(pathname, item);
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium transition-all focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        active
          ? "border-primary/30 bg-primary/15 text-sidebar-foreground shadow-[0_12px_30px_-20px_var(--color-primary)] ring-1 ring-inset ring-primary/20"
          : "text-sidebar-foreground/72 hover:border-sidebar-border hover:bg-white/[0.045] hover:text-sidebar-foreground",
      )}
    >
      <NavLinkContent item={item} active={active} showBadge={showBadge} badge={badge} />
    </Link>
  );
}

function NavLinkContent({
  item,
  active,
  showBadge,
  badge,
}: {
  item: NavItem;
  active: boolean;
  showBadge: boolean;
  badge?: number;
}) {
  const { pending } = useLinkStatus();
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const Icon = NAV_ICONS[item.icon];

  return (
    <>
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-primary" : "text-sidebar-foreground/55 group-hover/nav:text-sidebar-foreground/80",
        )}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{t(item.labelKey)}</span>
      {pending ? (
        <span className="ml-auto inline-flex items-center" aria-live="polite">
          <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only">{tc("loading")}</span>
        </span>
      ) : showBadge ? (
        <span
          className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none tabular-nums text-primary-foreground"
          aria-label={t("pendingCount", { count: badge ?? 0 })}
        >
          {(badge ?? 0) > 99 ? "99+" : badge}
        </span>
      ) : null}
    </>
  );
}
