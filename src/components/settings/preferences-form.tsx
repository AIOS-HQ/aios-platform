"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updatePreferences } from "@/lib/settings/actions";
import { idleState } from "@/lib/types";
import { locales, localeNames } from "@/i18n/config";
import { TIMEZONES } from "@/lib/timezones";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { FormMessage } from "@/components/shared/form-message";

export function PreferencesForm({
  language,
  timezone,
}: {
  language: string;
  timezone: string;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updatePreferences, idleState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("preferences.title")}</CardTitle>
        <CardDescription>{t("preferences.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="language">{t("preferences.language")}</Label>
            <Select name="language" defaultValue={language}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {localeNames[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t("preferences.timezone")}</Label>
            <Select name="timezone" defaultValue={timezone}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
