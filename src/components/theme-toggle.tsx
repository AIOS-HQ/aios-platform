"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Toggles `.dark` on <html> and persists the choice to localStorage.
 * Icon visibility is driven purely by CSS (`dark:` variants), so no React
 * state or effect is needed — the button just flips the class on click.
 */
export function ThemeToggle() {
  const t = useTranslations("common");

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("aios-theme", next ? "dark" : "light");
    } catch {
      // ignore storage failures (e.g. private mode)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={t("toggleTheme")}
      title={t("toggleTheme")}
    >
      <Sun className="size-4 dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-4 dark:block" aria-hidden="true" />
      <span className="sr-only">{t("toggleTheme")}</span>
    </Button>
  );
}
