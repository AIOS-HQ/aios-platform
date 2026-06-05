"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setWorkStatus } from "@/lib/harmony/os/work-actions";
import { WORK_STATUSES } from "@/lib/harmony/os/catalog";
import type { WorkStatus } from "@/types/database";

/** Inline status mover for a work item. */
export function WorkStatusSelect({
  id,
  status,
}: {
  id: string;
  status: WorkStatus;
}) {
  const tw = useTranslations("os.workStatus");
  const [pending, start] = useTransition();

  function onChange(value: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", value);
    start(async () => {
      await setWorkStatus(fd);
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[160px] text-xs" aria-label={tw(status)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {WORK_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {tw(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
