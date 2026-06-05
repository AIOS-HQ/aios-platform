"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { setDepartmentAutonomy } from "@/lib/harmony/os/department-actions";
import { AUTONOMY_LEVELS } from "@/lib/harmony/os/autonomy";

/** Inline 0–3 autonomy selector for a department. */
export function AutonomyControl({
  departmentId,
  level,
}: {
  departmentId: string;
  level: number;
}) {
  const t = useTranslations("os.autonomy");
  const td = useTranslations("os.departments");
  const [pending, start] = useTransition();

  function onChange(value: string) {
    start(async () => {
      await setDepartmentAutonomy(departmentId, Number(value));
      toast.success(td("autonomyUpdated"));
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="dept-autonomy">{td("autonomyLabel")}</Label>
      <Select
        value={String(level)}
        onValueChange={onChange}
        disabled={pending}
      >
        <SelectTrigger id="dept-autonomy" className="w-full sm:w-[260px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUTONOMY_LEVELS.map((l) => (
            <SelectItem key={l.level} value={String(l.level)}>
              {l.level} · {t(l.key)} {l.cost}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{td(`autonomyHint.${AUTONOMY_LEVELS[Math.max(0, Math.min(3, level))].key}`)}</p>
    </div>
  );
}
