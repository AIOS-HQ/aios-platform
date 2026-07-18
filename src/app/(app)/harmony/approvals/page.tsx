import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, Check, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { requireUser } from "@/lib/auth/user";
import { listApprovalsUnified, type ApprovalUnified } from "@/lib/data/os/approvals";
import { listCompanies } from "@/lib/data/os/companies";
import { listDepartments } from "@/lib/data/os/departments";
import { decideApproval, deleteApproval } from "@/lib/harmony/os/approval-actions";
import { ReviewQueue } from "@/components/harmony/workforce/review-queue";
import { listPendingApprovalsForReview } from "@/lib/harmony/autonomy/review-queue";
import {
  autonomyCostTier,
  autonomyKey,
  clampAutonomy,
} from "@/lib/harmony/os/autonomy";
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
import { ActionButton } from "@/components/shared/action-button";
import type { ApprovalStatus, Department, TaskPriority } from "@/types/database";

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

type Category = "work" | "content" | "comms";
const CATEGORY_ORDER: Category[] = ["work", "content", "comms"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("os.approvals");
  return { title: t("title") };
}

export default async function ApprovalsPage() {
  const t = await getTranslations("os.approvals");
  const tg = await getTranslations("os.approvals.group");
  const tr = await getTranslations("os.approvals.reason");
  const tt = await getTranslations("os.approvalType");
  const ts = await getTranslations("os.approvalStatus");
  const ta = await getTranslations("os.autonomy");
  const tp = await getTranslations("os.priority");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser();

  let companies: Awaited<ReturnType<typeof listCompanies>> = [];
  let departments: Awaited<ReturnType<typeof listDepartments>> = [];
  let selectedCompanyId: string | null = null;
  let approvals: ApprovalUnified[] = [];
  let spineApprovals: Awaited<ReturnType<typeof listPendingApprovalsForReview>> = [];
  let operationalErrorRef: string | null = null;
  let operationalErrorMessage: string | null = null;

  try {
    [companies, departments] = await Promise.all([
      listCompanies(),
      listDepartments(),
    ]);
    selectedCompanyId = companies.length === 1 ? companies[0]?.id ?? null : null;
    [approvals, spineApprovals] = await Promise.all([
      listApprovalsUnified({ companyId: selectedCompanyId ?? undefined }),
      listPendingApprovalsForReview(user.id, selectedCompanyId),
    ]);
  } catch (error) {
    const errorCode = error instanceof Error && error.message ? error.message : "unknown";
    operationalErrorRef = `APPR-${errorCode.slice(0, 48)}`;
    operationalErrorMessage = error instanceof Error ? error.message : "Unknown approvals error";
    console.error("[approvals-page] load_failed", {
      ref: operationalErrorRef,
      userId: user.id,
      companyId: selectedCompanyId,
      error: operationalErrorMessage,
    });
  }
  const spineByApprovalId = new Map(spineApprovals.map((row) => [row.approvalId, row]));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const deptById = new Map<string, Department>(departments.map((d) => [d.id, d]));
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending");
  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));

  function classify(a: ApprovalUnified): Category {
    if (a.message_id) return "comms";
    const dept = a.department_id ? deptById.get(a.department_id) : null;
    if (dept?.key === "content") return "content";
    return "work";
  }

  // Reason chips explaining why the item is gated.
  function reasons(a: ApprovalUnified): { key: string; text: string; tone: "muted" | "primary" | "warning" }[] {
    const out: { key: string; text: string; tone: "muted" | "primary" | "warning" }[] = [];
    const dept = a.department_id ? deptById.get(a.department_id) : null;
    if (dept) {
      const level = clampAutonomy(dept.autonomy_level);
      const tier = autonomyCostTier(level);
      out.push({
        key: "dept",
        text: `${dept.name} · ${ta(autonomyKey(level))}${tier ? ` ${tier}` : ""}`,
        tone: "muted",
      });
    }
    out.push({
      key: "gate",
      text: a.message_id ? tr("comms") : tr("belowOperator"),
      tone: "primary",
    });
    if (a.risk === "high") {
      out.push({ key: "risk", text: tr("highPriority"), tone: "warning" });
    }
    return out;
  }

  const toneClass: Record<"muted" | "primary" | "warning", string> = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };

  const grouped: Record<Category, ApprovalUnified[]> = { work: [], content: [], comms: [] };
  for (const a of pending) grouped[classify(a)].push(a);

  function renderPending(a: ApprovalUnified) {
    return (
      <li key={a.id} className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{a.title}</span>
          <Badge variant={riskVariant[a.risk]}>{tp(a.risk)}</Badge>
          {a.company_id && (
            <span className="text-xs text-muted-foreground">
              {companyName.get(a.company_id) ?? a.company_id}
            </span>
          )}
        </div>
        {a.summary && (
          <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {reasons(a).map((r) => (
            <span
              key={r.key}
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${toneClass[r.tone]}`}
            >
              {r.text}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {a.source === "legacy" ? (
            <>
              <ActionButton
                action={decideApproval}
                fields={{ id: a.id, decision: "approved" }}
                size="sm"
                successMessage={t("approveToast")}
              >
                <Check className="size-4" aria-hidden="true" />
                {t("approve")}
              </ActionButton>
              <ActionButton
                action={decideApproval}
                fields={{ id: a.id, decision: "rejected" }}
                size="sm"
                variant="outline"
                successMessage={t("rejectToast")}
              >
                <X className="size-4" aria-hidden="true" />
                {t("reject")}
              </ActionButton>
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
            </>
          ) : (
            <>
              {(() => {
                const spineApprovalId = a.summary?.match(/Approval payload:\s*(.+)$/)?.[1]?.trim() ?? null;
                const mapped = spineApprovalId ? spineByApprovalId.get(spineApprovalId) : null;
                if (!mapped) return <Badge variant="outline">Spine-managed</Badge>;
                return (
                  <ReviewQueue objectives={[]} work={[]} approvals={[mapped]} />
                );
              })()}
            </>
          )}
        </div>
      </li>
    );
  }

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

      {operationalErrorRef ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{t("error")}</p>
            <p className="mt-1 text-xs text-muted-foreground">Reference: {operationalErrorRef}</p>
            <p className="mt-2 text-xs text-muted-foreground break-all">{operationalErrorMessage}</p>
          </CardContent>
        </Card>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("empty.title")}
          description={t("empty.description")}
        >
          <Button asChild variant="outline">
            <Link href="/harmony/activity">
              <Activity className="size-4" aria-hidden="true" />
              {t("empty.cta")}
            </Link>
          </Button>
        </EmptyState>
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
                <div className="space-y-6">
                  {CATEGORY_ORDER.filter((c) => grouped[c].length > 0).map((c) => (
                    <section key={c} aria-label={tg(c)}>
                      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {tg(c)}
                        <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">
                          {grouped[c].length}
                        </span>
                      </h3>
                      <ul className="space-y-3">{grouped[c].map(renderPending)}</ul>
                    </section>
                  ))}
                </div>
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
