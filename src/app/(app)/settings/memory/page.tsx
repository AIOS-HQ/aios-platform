import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Brain } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listMemories } from "@/lib/memory/service";
import { isMemoryKind } from "@/lib/memory/types";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddMemoryForm } from "@/components/memory/add-memory-form";
import { DeleteMemoryButton } from "@/components/memory/delete-memory-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memory");
  return { title: t("title") };
}

export default async function MemoryPage() {
  const t = await getTranslations("memory");
  const user = await requireUser();
  const locale = await getLocale();
  const memories = await listMemories(user.id, { limit: 100 });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="flex flex-col gap-6 lg:max-w-3xl">
        <AddMemoryForm />

        {memories.length === 0 ? (
          <EmptyState
            icon={Brain}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {memories.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {isMemoryKind(m.kind) ? t(`kinds.${m.kind}`) : m.kind}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t("importanceLabel", { value: m.importance })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{m.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("sourceLabel", { source: m.source })} ·{" "}
                      {formatDate(m.created_at, locale)}
                    </p>
                  </div>
                  <DeleteMemoryButton id={m.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
