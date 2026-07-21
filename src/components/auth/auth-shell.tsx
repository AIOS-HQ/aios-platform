"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Activity,
  BookOpen,
  Building2,
  CreditCard,
  House,
  LogIn,
  Mail,
  Megaphone,
  Menu,
  Sparkles,
} from "lucide-react";
import { HarmonyMark } from "@/components/brand/harmony-logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  HarmonyLiveFeed,
  type FeedAudience,
} from "@/components/auth/harmony-live-feed";
import { cn } from "@/lib/utils";

type PublicNavItem = {
  key: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  authActive?: boolean;
};

const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { key: "access", href: "/login", icon: LogIn, authActive: true },
  { key: "home", href: "/", icon: House },
  { key: "features", href: "/features", icon: Sparkles },
  { key: "pricing", href: "/pricing", icon: CreditCard },
  { key: "resources", href: "/docs", icon: BookOpen },
  { key: "updates", icon: Megaphone },
  { key: "status", icon: Activity },
  { key: "company", icon: Building2 },
  { key: "contact", icon: Mail },
];

function AuthPublicNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("auth.executive.nav");

  return (
    <nav className="auth-public-nav" aria-label={t("label")}>
      {PUBLIC_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.authActive
          ? pathname === "/login" || pathname === "/reset-password" || pathname === "/update-password"
          : item.href === pathname;
        const content = (
          <>
            <Icon className="auth-public-nav__icon" aria-hidden="true" />
            <span>{t(item.key)}</span>
            {active ? <span className="auth-public-nav__active-dot" aria-hidden="true" /> : null}
          </>
        );

        if (!item.href) {
          return (
            <span
              key={item.key}
              className="auth-public-nav__item auth-public-nav__item--disabled"
              aria-disabled="true"
            >
              {content}
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn("auth-public-nav__item", active && "auth-public-nav__item--active")}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const t = useTranslations("auth.executive");

  return (
    <div className="auth-sidebar__footer">
      <LocaleSwitcher />
      <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
      <div className="auth-sidebar__legal">
        <Link href="/privacy">{t("footer.privacy")}</Link>
        <Link href="/terms">{t("footer.terms")}</Link>
      </div>
    </div>
  );
}

function MobileHeader() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("auth.executive");

  return (
    <header className="auth-mobile-header">
      <Link href="/" aria-label={t("homeAria")}>
        <HarmonyMark className="size-9" title="Harmony" />
      </Link>
      <div className="auth-mobile-header__actions">
        <Button asChild className="auth-register-button">
          <Link href="/signup">{t("utility.register")}</Link>
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("nav.openMenu")}>
              <Menu aria-hidden="true" />
            </Button>
          </DialogTrigger>
          <DialogContent className="auth-mobile-drawer">
            <DialogTitle className="sr-only">{t("nav.menu")}</DialogTitle>
            <AuthPublicNav onNavigate={() => setOpen(false)} />
            <SidebarFooter />
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}

export function AuthShell({
  children,
  feedAudience = "customer",
}: {
  children: React.ReactNode;
  feedAudience?: FeedAudience;
}) {
  const t = useTranslations("auth.executive");

  return (
    <div className="auth-executive">
      <div className="auth-executive__grid" aria-hidden="true" />
      <div className="auth-executive__glow auth-executive__glow--top" aria-hidden="true" />
      <div className="auth-executive__glow auth-executive__glow--floor" aria-hidden="true" />

      <aside className="auth-sidebar">
        <Link href="/" className="auth-sidebar__brand" aria-label={t("homeAria")}>
          <HarmonyMark className="size-10" title="Harmony" />
        </Link>
        <AuthPublicNav />
        <SidebarFooter />
      </aside>

      <MobileHeader />

      <div className="auth-desktop-utility" aria-label={t("utility.label")}>
        <LocaleSwitcher />
        <Button asChild className="auth-register-button">
          <Link href="/signup">{t("utility.register")}</Link>
        </Button>
      </div>

      <main id="main-content" className="auth-executive__main">
        <div className="auth-executive__canvas">
          <HarmonyLiveFeed audience={feedAudience} />

          <section className="auth-workspace auth-executive-panel" aria-label={t("workspaceLabel")}>
            <div className="auth-brand-panel">
              <div className="auth-brand-panel__copy">
                <p className="auth-kicker">{t("eyebrow")}</p>
                <h1>{t("title")}</h1>
                <p className="auth-brand-panel__subtitle">{t("subtitle")}</p>
              </div>

              <div className="auth-brand-panel__art" aria-hidden="true">
                <span className="auth-brand-panel__halo" />
                <HarmonyMark className="auth-brand-panel__mark" />
                <span className="auth-brand-panel__line auth-brand-panel__line--one" />
                <span className="auth-brand-panel__line auth-brand-panel__line--two" />
              </div>

              <div className="auth-advice">
                <div className="auth-advice__header">
                  <HarmonyMark className="size-8" />
                  <span>{t("advice.label")}</span>
                </div>
                <p>{t("advice.body")}</p>
                <Link href="/help" className="auth-inline-link">
                  {t("supportCta")}
                </Link>
              </div>
            </div>

            <div className="auth-executive-workspace auth-form-panel">{children}</div>
          </section>

          <footer className="auth-legal-footer">
            <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
            <span aria-hidden="true">•</span>
            <Link href="/privacy">{t("footer.privacy")}</Link>
            <span aria-hidden="true">•</span>
            <Link href="/terms">{t("footer.terms")}</Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
