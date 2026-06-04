"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, TriangleAlert } from "lucide-react";
import { deleteAccount } from "@/lib/settings/actions";
import { idleState } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export function DataCard({ email }: { email: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAccount, idleState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("data.title")}</CardTitle>
        <CardDescription>{t("data.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("data.export")}</p>
            <p className="text-sm text-muted-foreground">
              {t("data.exportHint")}
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/settings/export" download>
              <Download className="size-4" aria-hidden="true" />
              {t("data.exportButton")}
            </a>
          </Button>
        </div>

        <div className="rounded-lg border border-destructive/30 p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">{t("danger.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("danger.description")}
              </p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="mt-3">
                {t("danger.button")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("danger.confirmTitle")}</DialogTitle>
                <DialogDescription>{t("danger.confirmBody")}</DialogDescription>
              </DialogHeader>
              <form action={action} className="space-y-4">
                <FormMessage state={state} />
                <div className="space-y-2">
                  <Label htmlFor="confirmEmail">
                    {t("danger.confirmLabel", { email })}
                  </Label>
                  <Input
                    id="confirmEmail"
                    name="confirmEmail"
                    type="email"
                    autoComplete="off"
                    placeholder={email}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    {tc("cancel")}
                  </Button>
                  <SubmitButton
                    variant="destructive"
                    pendingLabel={t("danger.deleting")}
                  >
                    {t("danger.button")}
                  </SubmitButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
