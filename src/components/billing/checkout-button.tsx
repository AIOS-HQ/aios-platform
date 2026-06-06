"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanId } from "@/lib/billing/plans";

/**
 * Starts Stripe Checkout for a plan. Redirects unauthenticated visitors to
 * login first; otherwise posts to /api/billing/checkout and forwards to the
 * returned hosted Checkout URL.
 */
export function CheckoutButton({
  plan,
  label,
  errorLabel,
  className,
  variant = "default",
}: {
  plan: PlanId;
  label: string;
  errorLabel: string;
  className?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.status === 401) {
        router.push("/login?next=/pricing");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(errorLabel);
      setLoading(false);
    } catch {
      toast.error(errorLabel);
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={start}
      disabled={loading}
      variant={variant}
      size="lg"
      className={cn("w-full", className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {label}
      {!loading ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
    </Button>
  );
}
