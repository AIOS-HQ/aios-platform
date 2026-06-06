"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Disconnects an integration for the current user, then refreshes the page. */
export function DisconnectButton({
  provider,
  label,
  errorLabel,
}: {
  provider: string;
  label: string;
  errorLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function disconnect() {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
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
      variant="outline"
      size="sm"
      onClick={disconnect}
      disabled={loading}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}
