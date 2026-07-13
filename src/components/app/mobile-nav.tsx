"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AiosHarmonyLogo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { sectionsForAudience } from "./nav-config";
import { NavLink } from "./nav-link";

/**
 * Slide-in navigation drawer for small screens. Founders see the full Founder
 * OS; customers see the Harmony experience (personal hub + settings).
 */
export function MobileNav({
  badges,
  isFounder = false,
}: {
  /** Map of nav href → badge count (e.g. pending approvals). */
  badges?: Record<string, number>;
  /** Founder/admin sees the Founder OS command group. */
  isFounder?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const close = () => setOpen(false);
  const sections = sectionsForAudience(isFounder);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={t("openMenu")}
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 flex h-dvh max-w-[17rem] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:rounded-none">
        <DialogTitle className="sr-only">{t("menu")}</DialogTitle>
        <div className="flex h-16 items-center border-b border-sidebar-border/70 px-4">
          <AiosHarmonyLogo />
        </div>
        <nav
          className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
          aria-label={t("mobile")}
        >
          {sections.map((section, i) => (
            <div
              key={section.titleKey ?? `section-${i}`}
              className="flex flex-col gap-1.5"
            >
              {section.titleKey && (
                <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.13em] text-sidebar-foreground/65">
                  {t(`sections.${section.titleKey}`)}
                </p>
              )}
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  badge={badges?.[item.href]}
                  onNavigate={close}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border/70 p-3">
          <LocaleSwitcher />
        </div>
      </DialogContent>
    </Dialog>
  );
}
