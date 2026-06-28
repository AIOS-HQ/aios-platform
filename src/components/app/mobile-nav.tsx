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
import { HarmonyLogo } from "@/components/brand/harmony-logo";
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
      <DialogContent className="left-0 top-0 flex h-dvh max-w-[17rem] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r p-0 sm:rounded-none">
        <DialogTitle className="sr-only">{t("menu")}</DialogTitle>
        <div className="flex h-16 items-center px-5">
          <HarmonyLogo />
        </div>
        <nav
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-3"
          aria-label={t("mobile")}
        >
          {sections.map((section, i) => (
            <div
              key={section.titleKey ?? `section-${i}`}
              className="flex flex-col gap-1"
            >
              {section.titleKey && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
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
        <div className="border-t p-3">
          <LocaleSwitcher />
        </div>
      </DialogContent>
    </Dialog>
  );
}
