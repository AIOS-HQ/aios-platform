"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reusable waitlist / early-access capture form.
 *
 * Posts the email to /api/waitlist (no database write — the route validates and
 * acknowledges; persistence/CRM wiring lands with the integration framework).
 * Copy is sourced from the localized `landing` namespace so EN + ES are covered.
 */
export function WaitlistForm({
  source = "landing",
  className,
}: {
  source?: string;
  className?: string;
}) {
  const t = useTranslations("landing");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t("waitlist.invalid"));
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source }),
      });
      if (!res.ok) throw new Error("request failed");
      setStatus("done");
      toast.success(t("waitlist.success"));
    } catch {
      setStatus("idle");
      toast.error(t("waitlist.error"));
    }
  }

  if (status === "done") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-foreground",
          className,
        )}
        role="status"
      >
        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
        {t("waitlist.success")}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cn("w-full", className)} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor={`waitlist-${source}`} className="sr-only">
            {t("waitlist.emailLabel")}
          </label>
          <Input
            id={`waitlist-${source}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("waitlist.placeholder")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            className="h-11 border-white/15 bg-white/5 text-base text-foreground placeholder:text-muted-foreground/70"
          />
        </div>
        <Button type="submit" size="lg" className="h-11 shrink-0" disabled={status === "loading"}>
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {t("waitlist.joining")}
            </>
          ) : (
            <>
              {t("waitlist.cta")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
