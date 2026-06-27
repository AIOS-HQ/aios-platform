import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getConnectionSecret } from "@/lib/integrations/secrets";
import { runSupabaseDiagnostics } from "@/lib/integrations/clients/supabase-diagnostics";
import { runVercelDiagnostics } from "@/lib/integrations/clients/vercel-diagnostics";
import type { DiagnosticsResult } from "@/lib/integrations/clients/supabase-diagnostics";
import { runProductionReadiness } from "@/lib/integrations/clients/production-readiness";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DisconnectButton } from "@/components/integrations/disconnect-button";
import { ConnectKeyForm } from "@/components/integrations/connect-key-form";
import {
  ExecutiveList,
  ExecutiveSection,
} from "@/components/shared/executive";

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
  const isAdmin = await currentUserIsAdmin();
  const [supabase, vercel] = await Promise.all([
    runSupabaseDiagnostics(user.id),
    runVercelDiagnostics(user.id),
  ]);
  const readiness = isAdmin
    ? await runProductionReadiness(user.id, await getConnectionSecret(user.id, "supabase"))
    : null;

  const sections: Section[] = [
    { provider: "supabase", name: "Supabase", result: supabase, accountPlaceholder: "project-ref" },
    { provider: "vercel", name: "Vercel", result: vercel, accountPlaceholder: "project-id" },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6">
        {readiness ? (
          <ExecutiveSection
            icon={readiness.status === "ok" ? CheckCircle2 : XCircle}
            title={t("production.title")}
            description={t("production.subtitle")}
          >
            <Card>
              <CardContent className="space-y-5 p-5">
              <div className="flex flex-col gap-3 rounded-lg border bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{t("production.overall")}</span>
                <Badge variant={readiness.status === "ok" ? "success" : "warning"}>
                  {t(`production.status.${readiness.status}`)}
                </Badge>
              </div>

              {readiness.sections.map((section) => (
                <div key={section.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">
                      {t(`production.sections.${section.id}`)}
                    </h2>
                    <Badge variant={section.status === "ok" ? "success" : "warning"}>
                      {t(`production.status.${section.status}`)}
                    </Badge>
                  </div>
                  <ExecutiveList>
                    {section.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex items-center gap-2">
                          {it.ok ? (
                            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                          ) : (
                            <XCircle className="size-4 text-warning" aria-hidden="true" />
                          )}
                          {t(`production.items.${it.id}`)}
                        </span>
                        <span className="min-w-0 break-words text-muted-foreground sm:text-right">{it.detail}</span>
                      </li>
                    ))}
                  </ExecutiveList>
                </div>
              ))}
              </CardContent>
            </Card>
          </ExecutiveSection>
        ) : null}

        {sections.map((s) => (
          <Card key={s.provider} className="overflow-hidden">
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
            <CardContent className="p-5 pt-0">
              {s.result.connected ? (
                <ExecutiveList>
                  {s.result.items.map((it) => (
                    <li
                      key={it.id}
                      className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {it.ok ? (
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-4 text-destructive" aria-hidden="true" />
                        )}
                        {t(`capabilities.${it.id}`)}
                      </span>
                      <span className="min-w-0 break-words text-muted-foreground sm:text-right">{it.detail}</span>
                    </li>
                  ))}
                </ExecutiveList>
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
