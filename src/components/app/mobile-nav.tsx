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
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/brand/logo";
import { primaryNav, secondaryNav } from "./nav-config";
import { NavLink } from "./nav-link";

/** Slide-in navigation drawer for small screens. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const close = () => setOpen(false);

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
      <DialogContent className="left-0 top-0 h-dvh max-w-[17rem] translate-x-0 translate-y-0 gap-0 rounded-none border-r p-0 sm:rounded-none">
        <DialogTitle className="sr-only">{t("menu")}</DialogTitle>
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <nav className="flex flex-col gap-1 p-3" aria-label="Mobile">
          {primaryNav.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={close} />
          ))}
          <Separator className="my-2" />
          {secondaryNav.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={close} />
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
