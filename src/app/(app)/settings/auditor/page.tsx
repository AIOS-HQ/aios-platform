import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/user";
import { runAudit, type Severity } from "@/lib/agents/auditor/service";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecordAuditButton } from "@/components/agent/record-audit-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auditor");
  return { title: t("title") };
}

const SEV_VARIANT: Record<Severity, "default" | "secondary" | "outline" | "destructive"> = {
  ok: "secondary",
  info: "outline",
  warn: "default",
  risk: "destructive",
};

export default async function AuditorPage() {
  const t = await getTranslations("auditor");
  const user = await requireUser();
  const locale = await getLocale();
  const report = await runAudit(user.id);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t("riskHeading")}</CardTitle>
              <CardDescription>
                {t("generatedAtLabel", {
                  date: formatDate(report.generatedAt, locale),
                })}
              </CardDescription>
            </div>
            <Badge variant={SEV_VARIANT[report.posture]}>
              {t(`posture.${report.posture}`)}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">{t("counts.risk", { n: report.counts.risk })}</Badge>
            <Badge variant="default">{t("counts.warn", { n: report.counts.warn })}</Badge>
            <Badge variant="outline">{t("counts.info", { n: report.counts.info })}</Badge>
            <Badge variant="secondary">{t("counts.ok", { n: report.counts.ok })}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{t("findingsHeading")}</CardTitle>
              <CardDescription>{t("subtitle")}</CardDescription>
            </div>
            <RecordAuditButton />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {report.findings.map((f, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{f.title}</span>
                    <Badge variant="outline">{t(`domains.${f.domain}`)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.detail}</p>
                </div>
                <Badge variant={SEV_VARIANT[f.severity]}>
                  {t(`severity.${f.severity}`)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
