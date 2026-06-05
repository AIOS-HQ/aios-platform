"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary. Renders inside the root layout (so i18n + theme
 * are available) and lets the user recover without a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    // Surface for server/client log capture (observability tracked in #43).
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("body")}</p>
      <Button onClick={() => reset()}>{t("retry")}</Button>
    </div>
  );
}
