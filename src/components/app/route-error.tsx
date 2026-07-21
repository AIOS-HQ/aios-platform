"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error("[authenticated route error]", error);
  }, [error]);

  return (
    <section className="app-route-state" role="alert" aria-labelledby="app-route-error-title">
      <span className="app-route-state__icon" aria-hidden="true">
        <CircleAlert />
      </span>
      <h1 id="app-route-error-title">{t("title")}</h1>
      <p>{t("body")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </section>
  );
}
