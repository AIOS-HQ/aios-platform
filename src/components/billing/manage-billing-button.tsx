"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Opens the Stripe Billing Portal for the current user. */
export function ManageBillingButton({
  label,
  errorLabel,
}: {
  label: string;
  errorLabel: string;
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
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
    <Button type="button" onClick={open} disabled={loading} variant="outline">
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <ExternalLink className="size-4" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
