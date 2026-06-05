import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Check, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listApprovals } from "@/lib/data/os/approvals";
import { listCompanies } from "@/lib/data/os/companies";
import { decideApproval, deleteApproval } from "@/lib/harmony/os/approval-actions";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApprovalDialog } from "@/components/harmony/os/approval-dialog";
import { ConfirmDeleteDialog } from "@/components/harmony/confirm-delete-dialog";
import type { ApprovalStatus, TaskPriority } from "@/types/database";

const riskVariant: Record<TaskPriority, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
};
const statusVariant: Record<ApprovalStatus, "secondary" | "success" | "outline"> = {
  pending: "secondary",
  approved: "success",
  rejected: "outline",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.approvals");
  return { title: t("title") };
}

export default async function ApprovalsPage() {
  const t = await getTranslations("os.approvals");
  const tt = await getTranslations("os.approvalType");
  const ts = await getTranslations("os.approvalStatus");
  const tp = await getTranslations("os.priority");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  await requireUser();

  const [approvals, companies] = await Promise.all([
    listApprovals(),
    listCompanies(),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");
  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")}>
        <ApprovalDialog companies={companyOpts}>
          <Button>
            <Plus className="size-4" aria-hidden="true" />
            {t("new")}
          </Button>
        </ApprovalDialog>
      </PageHeader>

      {approvals.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("empty.title")}
          description={t("empty.description")}
        />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                {t("pending")}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
                  {pending.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noPending")}</p>
              ) : (
                <ul className="space-y-3">
                  {pending.map((a) => (
                    <li key={a.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        <Badge variant="outline">{tt(a.type)}</Badge>
                        <Badge variant={riskVariant[a.risk]}>{tp(a.risk)}</Badge>
                        {a.company_id && companyName.get(a.company_id) && (
                          <span className="text-xs text-muted-foreground">
                            {companyName.get(a.company_id)}
                          </span>
                        )}
                      </div>
                      {a.summary && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {a.summary}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <form action={decideApproval}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="decision" value="approved" />
                          <Button type="submit" size="sm">
                            <Check className="size-4" aria-hidden="true" />
                            {t("approve")}
                          </Button>
                        </form>
                        <form action={decideApproval}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <Button type="submit" size="sm" variant="outline">
                            <X className="size-4" aria-hidden="true" />
                            {t("reject")}
                          </Button>
                        </form>
                        <ConfirmDeleteDialog action={deleteApproval} id={a.id} itemTitle={a.title}>
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

          {decided.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("history")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {decided.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium">{a.title}</span>
                        <p className="text-xs text-muted-foreground">
                          {tt(a.type)}
                          {a.decided_at ? ` · ${formatDate(a.decided_at, locale)}` : ""}
                        </p>
                      </div>
                      <Badge variant={statusVariant[a.status]} className="shrink-0">
                        {ts(a.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
