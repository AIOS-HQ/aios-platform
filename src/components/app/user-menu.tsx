"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

export function UserMenu({
  name,
  email,
  initials,
  imageUrl,
}: {
  name: string;
  email: string;
  initials: string;
  imageUrl?: string | null;
}) {
  const t = useTranslations("nav");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label={t("account")}>
          <Avatar className="size-7">
            {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">
            {name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9">
              {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate">{name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="size-4" aria-hidden="true" />
            {t("settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t("signOut")}
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
