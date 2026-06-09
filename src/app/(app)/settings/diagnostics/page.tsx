import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { runSupabaseDiagnostics } from "@/lib/integrations/clients/supabase-diagnostics";
import { runVercelDiagnostics } from "@/lib/integrations/clients/vercel-diagnostics";
import type { DiagnosticsResult } from "@/lib/integrations/clients/supabase-diagnostics";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DisconnectButton } from "@/components/integrations/disconnect-button";
import { ConnectKeyForm } from "@/components/integrations/connect-key-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("diagnostics");
  return { title: t("title") };
}

interface Section {
  provider: "supabase" | "vercel";
  name: string;
  result: DiagnosticsResult;
  accountPlaceholder: string;
}

export default async function DiagnosticsPage() {
  const t = await getTranslations("diagnostics");
  const user = await requireUser();
  const [supabase, vercel] = await Promise.all([
    runSupabaseDiagnostics(user.id),
    runVercelDiagnostics(user.id),
  ]);

  const sections: Section[] = [
    { provider: "supabase", name: "Supabase", result: supabase, accountPlaceholder: "project-ref" },
    { provider: "vercel", name: "Vercel", result: vercel, accountPlaceholder: "project-id" },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        {sections.map((s) => (
          <Card key={s.provider}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle>{s.name}</CardTitle>
                <CardDescription>{t("readOnlyNote")}</CardDescription>
              </div>
              {s.result.connected ? (
                <DisconnectButton
                  provider={s.provider}
                  label={t("disconnect")}
                  errorLabel={t("disconnectError")}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {s.result.connected ? (
                <ul className="flex flex-col gap-2">
                  {s.result.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        {it.ok ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-4 text-destructive" aria-hidden="true" />
                        )}
                        {t(`capabilities.${it.id}`)}
                      </span>
                      <span className="truncate text-muted-foreground">{it.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t(`connectHint.${s.provider}`)}
                  </p>
                  <ConnectKeyForm
                    provider={s.provider}
                    tokenLabel={t(`tokenLabel.${s.provider}`)}
                    accountLabel={t(`accountLabel.${s.provider}`)}
                    accountPlaceholder={s.accountPlaceholder}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <p className="text-sm text-muted-foreground">{t("securityNote")}</p>
      </div>
    </>
  );
}
