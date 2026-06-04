"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { setLocale } from "@/i18n/actions";
import { locales, localeNames, type Locale } from "@/i18n/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Language switcher. Writes the locale cookie via a server action, then refreshes. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    startTransition(async () => {
      await setLocale(next as Locale);
      router.refresh();
    });
  }

  return (
    <Select value={locale} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-9 w-[140px]" aria-label="Select language">
        <Globe className="size-4 opacity-70" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((l) => (
          <SelectItem key={l} value={l}>
            {localeNames[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
