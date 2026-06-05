"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { generateContent } from "@/lib/harmony/content/content-actions";
import { CONTENT_TASK_TYPES } from "@/lib/harmony/content/catalog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { LIMITS } from "@/lib/limits";

type CompanyOpt = { id: string; name: string };

/**
 * "Ask Harmony to create." Pick a capability (strategy, script, outline…), give
 * a topic, and Harmony routes it to the right Content helper, which generates
 * the draft or requests approval based on the department's autonomy.
 */
export function GenerateContentDialog({
  companies,
  defaultTaskKey,
  children,
}: {
  companies: CompanyOpt[];
  defaultTaskKey?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [taskKey, setTaskKey] = useState(
    defaultTaskKey ?? CONTENT_TASK_TYPES[0].key,
  );
  const t = useTranslations("os.content");
  const tt = useTranslations("os.contentTask");
  const tc = useTranslations("common");
  const router = useRouter();

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = await generateContent(idleState, formData);
    if (res.status === "error") {
      setError(res.message ?? "");
      return;
    }
    const draftId = res.meta?.workItemId;
    toast.success(
      res.message ?? tc("save"),
      draftId
        ? {
            action: {
              label: t("viewDraft"),
              onClick: () =>
                router.push(`/harmony/content?item=${draftId}#item-${draftId}`),
            },
          }
        : undefined,
    );
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("generateTitle")}</DialogTitle>
          <DialogDescription>{t("generateDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="task_key" value={taskKey} />
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="content-task">{t("fields.capability")}</Label>
            <Select value={taskKey} onValueChange={setTaskKey}>
              <SelectTrigger id="content-task">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TASK_TYPES.map((task) => (
                  <SelectItem key={task.key} value={task.key}>
                    {tt(`${task.key}.label`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {tt(`${taskKey}.desc`)}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-topic">{t("fields.topic")}</Label>
            <Input
              id="content-topic"
              name="topic"
              maxLength={LIMITS.title}
              placeholder={t("topicPlaceholder")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-company">{t("fields.company")}</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="content-company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={t("working")}>
              {t("generateButton")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
