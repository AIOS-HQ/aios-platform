import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Bot, Pause, Pencil, Play, Plus, Trash2, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { getDepartment } from "@/lib/data/os/departments";
import { getCompany } from "@/lib/data/os/companies";
import { listAgents } from "@/lib/data/os/agents";
import { clampAutonomy } from "@/lib/harmony/os/autonomy";
import { deleteDepartment } from "@/lib/harmony/os/department-actions";
import { deleteAgent, setAgentStatus } from "@/lib/harmony/os/agent-actions";
import { PageHeader } from "@/components/shared/page-header";
import { InlineEmpty } from "@/components/shared/inline-empty";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutonomyControl } from "@/components/harmony/os/autonomy-control";
import { DepartmentDialog } from "@/components/harmony/os/department-dialog";
import { AgentDialog } from "@/components/harmony/os/agent-dialog";
import { ConfirmDeleteDialog } from "@/components/harmony/confirm-delete-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await requireUser();
  const dept = await getDepartment(id);
  return { title: dept?.name ?? "Department" };
}

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("os.departments");
  const tg = await getTranslations("os.agents");
  const tc = await getTranslations("common");
  await requireUser();

  const dept = await getDepartment(id);
  if (!dept) notFound();

  const [company, agents] = await Promise.all([
    getCompany(dept.company_id),
    listAgents(dept.id),
  ]);

  return (
    <>
      {company && (
        <Link
          href={`/harmony/companies/${company.slug}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {company.name}
        </Link>
      )}

      <PageHeader title={dept.name} description={dept.description ?? undefined}>
        <DepartmentDialog department={dept}>
          <Button variant="outline">
            <Pencil className="size-4" aria-hidden="true" />
            {tc("edit")}
          </Button>
        </DepartmentDialog>
        <ConfirmDeleteDialog
          action={deleteDepartment}
          id={dept.id}
          itemTitle={dept.name}
        >
          <Button variant="outline" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" aria-hidden="true" />
            {tc("delete")}
          </Button>
        </ConfirmDeleteDialog>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("autonomyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AutonomyControl
              departmentId={dept.id}
              level={clampAutonomy(dept.autonomy_level)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-primary" aria-hidden="true" />
              {t("agents")}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                {agents.length}
              </span>
            </CardTitle>
            <AgentDialog departmentId={dept.id}>
              <Button size="sm" variant="outline">
                <Plus className="size-4" aria-hidden="true" />
                {tg("add")}
              </Button>
            </AgentDialog>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <InlineEmpty icon={Bot} message={t("noAgents")} />
            ) : (
              <ul className="space-y-2">
                {agents.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{a.name}</span>
                        <Badge
                          variant={a.status === "active" ? "secondary" : "outline"}
                          className="shrink-0"
                        >
                          {t(`agentStatus.${a.status}`)}
                        </Badge>
                      </div>
                      {a.role && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {a.role}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <form action={setAgentStatus}>
                        <input type="hidden" name="id" value={a.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={a.status === "active" ? "paused" : "active"}
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={a.status === "active" ? tg("pause") : tg("resume")}
                        >
                          {a.status === "active" ? (
                            <Pause className="size-4" aria-hidden="true" />
                          ) : (
                            <Play className="size-4" aria-hidden="true" />
                          )}
                        </Button>
                      </form>
                      <AgentDialog agent={a}>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={tc("edit")}>
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                      </AgentDialog>
                      <ConfirmDeleteDialog action={deleteAgent} id={a.id} itemTitle={a.name}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={tc("delete")}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </ConfirmDeleteDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
