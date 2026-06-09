"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { addMemoryAction } from "@/lib/memory/actions";
import { idleState } from "@/lib/types";
import { MEMORY_KINDS } from "@/lib/memory/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

/** Manually capture a memory. The write service also powers automatic capture later. */
export function AddMemoryForm() {
  const t = useTranslations("memory");
  const [state, action] = useActionState(addMemoryAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? t("addedToast"));
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("addHeading")}</CardTitle>
        <CardDescription>{t("addSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="space-y-4">
          {state.status === "error" ? <FormMessage state={state} /> : null}
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <div className="space-y-2">
              <Label htmlFor="memory-kind">{t("kindLabel")}</Label>
              <Select name="kind" defaultValue="preference">
                <SelectTrigger id="memory-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memory-content">{t("contentLabel")}</Label>
              <Textarea
                id="memory-content"
                name="content"
                rows={3}
                maxLength={4000}
                placeholder={t("contentPlaceholder")}
                required
              />
            </div>
          </div>
          <SubmitButton pendingLabel={t("adding")}>{t("addButton")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
