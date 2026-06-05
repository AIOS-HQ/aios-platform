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
import { setContentStatus } from "@/lib/harmony/content/calendar-actions";
import { CONTENT_ITEM_STATUSES } from "@/lib/harmony/content/catalog";
import type { ContentItemStatus } from "@/types/database";

/** Inline status mover for a content item (idea → published). */
export function ContentStatusSelect({
  id,
  status,
}: {
  id: string;
  status: ContentItemStatus;
}) {
  const ts = useTranslations("os.contentItemStatus");
  const [pending, start] = useTransition();

  function onChange(value: string) {
    start(async () => {
      await setContentStatus(id, value);
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={ts(status)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CONTENT_ITEM_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {ts(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
