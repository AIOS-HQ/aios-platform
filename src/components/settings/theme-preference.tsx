"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateThemePreference } from "@/lib/settings/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];

/** Applies the theme to the document immediately (cookie + class) for instant feedback. */
function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.cookie = `aios-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem("aios-theme", theme);
  } catch {
    // ignore storage failures
  }
}

export function ThemePreference({ theme: initial }: { theme: string }) {
  const t = useTranslations("settings");
  const [theme, setTheme] = useState<Theme>(
    THEMES.includes(initial as Theme) ? (initial as Theme) : "system",
  );
  const [, startTransition] = useTransition();

  function onChange(next: Theme) {
    setTheme(next);
    applyTheme(next);
    startTransition(async () => {
      await updateThemePreference(next);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("appearance.title")}</CardTitle>
        <CardDescription>{t("appearance.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SegmentedControl<Theme>
          ariaLabel={t("appearance.title")}
          value={theme}
          onChange={onChange}
          options={[
            { value: "system", label: t("appearance.system") },
            { value: "light", label: t("appearance.light") },
            { value: "dark", label: t("appearance.dark") },
          ]}
        />
      </CardContent>
    </Card>
  );
}
