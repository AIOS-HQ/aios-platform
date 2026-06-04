"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfile } from "@/lib/settings/actions";
import { idleState } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";
import { LIMITS } from "@/lib/limits";

export function ProfileForm({ fullName }: { fullName: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateProfile, idleState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
        <CardDescription>{t("profile.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="fullName">{t("profile.fullName")}</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={fullName}
              maxLength={LIMITS.name}
              autoComplete="name"
            />
          </div>
          <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
