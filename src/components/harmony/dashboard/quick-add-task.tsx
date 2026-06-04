"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createTask } from "@/lib/harmony/task-actions";
import { idleState } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LIMITS } from "@/lib/limits";

/** One-line task capture for the dashboard (uses the existing createTask action + defaults). */
export function QuickAddTask() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const title = value.trim();
    if (!title || pending) return;
    const fd = new FormData();
    fd.set("title", title);
    start(async () => {
      const res = await createTask(idleState, fd);
      if (res.status === "error") {
        toast.error(res.message ?? "");
        return;
      }
      toast.success(t("quickAdd.added"));
      setValue("");
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("quickAdd.placeholder")}
        aria-label={t("quickAdd.placeholder")}
        maxLength={LIMITS.title}
        disabled={pending}
      />
      <Button
        type="submit"
        size="icon"
        disabled={pending || !value.trim()}
        aria-label={t("quickAdd.button")}
        title={tc("create")}
      >
        <Plus className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
