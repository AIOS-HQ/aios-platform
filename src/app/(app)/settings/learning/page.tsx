import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import {
  isLearningEnabled,
  summarizeLearning,
  LEARNING_CATEGORIES,
} from "@/lib/memory/learning";
import { isMemoryKind } from "@/lib/memory/types";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LearningToggle } from "@/components/memory/learning-toggle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("learning");
  return { title: t("title") };
}

export default async function LearningPage() {
  const t = await getTranslations("learning");
  const tk = await getTranslations("memory");
  const user = await requireUser();
  const locale = await getLocale();
  const [enabled, summary] = await Promise.all([
    isLearningEnabled(user.id),
    summarizeLearning(user.id),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>{t("statusHeading")}</CardTitle>
            <CardDescription>
              {enabled ? t("statusOn") : t("statusOff")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <Badge variant={enabled ? "success" : "secondary"}>
              {enabled ? t("on") : t("off")}
            </Badge>
            <LearningToggle enabled={enabled} />
          </CardContent>
        </Card>

        {summary.total === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {LEARNING_CATEGORIES.map((cat) => (
                <Card key={cat}>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">{summary.byCategory[cat]}</p>
                    <p className="text-sm text-muted-foreground">
                      {t(`categories.${cat}`)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("signalsHeading")}</CardTitle>
                <CardDescription>{t("signalsSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {summary.topKinds.map((k) => (
                  <div
                    key={k.kind}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>
                      {isMemoryKind(k.kind) ? tk(`kinds.${k.kind}`) : k.kind}
                    </span>
                    <Badge variant="secondary">{k.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {summary.recentDecisions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("decisionsHeading")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {summary.recentDecisions.map((d, i) => (
                    <div key={i} className="space-y-0.5">
                      <p className="text-sm leading-relaxed">{d.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.created_at, locale)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/settings/memory">{t("reviewCta")}</Link>
        </Button>
      </div>
    </>
  );
}
