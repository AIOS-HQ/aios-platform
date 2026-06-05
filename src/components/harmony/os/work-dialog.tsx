"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createWorkItem, updateWorkItem } from "@/lib/harmony/os/work-actions";
import { idleState } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { LIMITS } from "@/lib/limits";
import { WORK_STATUSES } from "@/lib/harmony/os/catalog";
import type { TaskPriority, WorkItem } from "@/types/database";

type CompanyOpt = { id: string; name: string };
type DeptOpt = { id: string; name: string; company_id: string };
type AgentOpt = { id: string; name: string; department_id: string };
type ProjectOpt = { id: string; name: string; company_id: string };

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

export function WorkDialog({
  companies,
  departments,
  agents,
  projects,
  workItem,
  defaultCompanyId,
  defaultDepartmentId,
  children,
}: {
  companies: CompanyOpt[];
  departments: DeptOpt[];
  agents: AgentOpt[];
  projects: ProjectOpt[];
  workItem?: WorkItem;
  defaultCompanyId?: string;
  defaultDepartmentId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(
    workItem?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? "",
  );
  const [departmentId, setDepartmentId] = useState(
    workItem?.department_id ?? defaultDepartmentId ?? "none",
  );
  const t = useTranslations("os.work");
  const tw = useTranslations("os.workStatus");
  const tp = useTranslations("os.priority");
  const tc = useTranslations("common");
  const editing = Boolean(workItem);

  const deptOptions = departments.filter((d) => d.company_id === companyId);
  const agentOptions = agents.filter((a) => a.department_id === departmentId);
  const projectOptions = projects.filter((p) => p.company_id === companyId);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = editing
      ? await updateWorkItem(idleState, formData)
      : await createWorkItem(idleState, formData);
    if (res.status === "error") {
      setError(res.message ?? "");
      return;
    }
    toast.success(res.message ?? tc("save"));
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t("edit") : t("new")}</DialogTitle>
          <DialogDescription>{t("dialogDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {workItem && <input type="hidden" name="id" value={workItem.id} />}
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="department_id" value={departmentId} />
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="work-title">{t("fields.title")}</Label>
            <Input
              id="work-title"
              name="title"
              defaultValue={workItem?.title ?? ""}
              maxLength={LIMITS.title}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-desc">{t("fields.description")}</Label>
            <Textarea
              id="work-desc"
              name="description"
              defaultValue={workItem?.description ?? ""}
              maxLength={LIMITS.description}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="work-company">{t("fields.company")}</Label>
                <Select
                  value={companyId}
                  onValueChange={(v) => {
                    setCompanyId(v);
                    setDepartmentId("none");
                  }}
                >
                  <SelectTrigger id="work-company">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="work-dept">{t("fields.department")}</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => setDepartmentId(v)}
              >
                <SelectTrigger id="work-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("unassigned")}</SelectItem>
                  {deptOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-agent">{t("fields.agent")}</Label>
              <Select name="agent_id" defaultValue={workItem?.agent_id ?? "none"}>
                <SelectTrigger id="work-agent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("unassigned")}</SelectItem>
                  {agentOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-project">{t("fields.project")}</Label>
              <Select
                name="project_id"
                defaultValue={workItem?.project_id ?? "none"}
              >
                <SelectTrigger id="work-project">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noProject")}</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="work-priority">{t("fields.priority")}</Label>
              <Select name="priority" defaultValue={workItem?.priority ?? "medium"}>
                <SelectTrigger id="work-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {tp(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-status">{t("fields.status")}</Label>
              <Select name="status" defaultValue={workItem?.status ?? "pending"}>
                <SelectTrigger id="work-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tw(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="work-due">{t("fields.dueDate")}</Label>
              <Input
                id="work-due"
                name="due_date"
                type="date"
                defaultValue={workItem?.due_date ?? ""}
              />
            </div>
          </div>

          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>
              {editing ? tc("save") : tc("create")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
