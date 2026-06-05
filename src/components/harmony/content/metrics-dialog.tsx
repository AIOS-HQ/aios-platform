"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setContentMetrics } from "@/lib/harmony/content/calendar-actions";
import { CONTENT_METRIC_KEYS } from "@/lib/harmony/content/insights";
import { idleState } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import type { ContentItem } from "@/types/database";

/** Enter the analytics snapshot for a content item (manual now, API later). */
export function MetricsDialog({
  item,
  children,
}: {
  item: ContentItem;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("os.content");
  const tm = useTranslations("os.contentMetric");
  const tc = useTranslations("common");

  async function onSubmit(formData: FormData) {
    const res = await setContentMetrics(idleState, formData);
    if (res.status === "error") {
      toast.error(res.message ?? "");
      return;
    }
    toast.success(res.message ?? tc("save"));
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("metricsTitle")}</DialogTitle>
          <DialogDescription>{item.title}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="id" value={item.id} />
          <div className="grid grid-cols-2 gap-4">
            {CONTENT_METRIC_KEYS.map((k) => (
              <div key={k} className="space-y-2">
                <Label htmlFor={`metric-${k}`}>{tm(k)}</Label>
                <Input
                  id={`metric-${k}`}
                  name={k}
                  type="number"
                  min={0}
                  defaultValue={item[k] ?? 0}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
