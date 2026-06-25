"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runHarmonyReflection } from "@/lib/harmony/reflection-actions";

/**
 * Triggers a fresh Harmony reflection and enriches Julius with it (human in the
 * loop — reflection is saved only when the founder asks). Re-renders the page so
 * the new reflection and its Julius entry appear immediately.
 */
export function HarmonyReflectButton() {
  const t = useTranslations("julius");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const { saved } = await runHarmonyReflection();
            toast.success(saved > 0 ? t("reflection.saved") : t("reflection.upToDate"));
            router.refresh();
          } catch {
            toast.error(t("reflection.failed"));
          }
        })
      }
    >
      <RefreshCw
        className={pending ? "size-4 animate-spin" : "size-4"}
        aria-hidden="true"
      />
      {t("reflection.reflect")}
    </Button>
  );
}
