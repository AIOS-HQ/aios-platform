"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type CompanyOption = { id: string; name: string; slug: string };

/** Header switcher to jump between companies / the Command Center. */
export function CompanySwitcher({ companies }: { companies: CompanyOption[] }) {
  const pathname = usePathname();
  const t = useTranslations("os.companies");

  const match = pathname.match(/^\/harmony\/companies\/([^/]+)/);
  const activeSlug = match?.[1];
  const active = companies.find((c) => c.slug === activeSlug);
  const label = active?.name ?? t("allCompanies");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[12rem] gap-2"
          aria-label={t("switchLabel")}
        >
          <Building2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{t("switchLabel")}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/harmony">{t("allCompanies")}</Link>
        </DropdownMenuItem>
        {companies.length > 0 && <DropdownMenuSeparator />}
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <Link href={`/harmony/companies/${c.slug}`} className="truncate">
              {c.name}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/harmony/companies">
            <Plus className="size-4" aria-hidden="true" />
            {t("new")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
