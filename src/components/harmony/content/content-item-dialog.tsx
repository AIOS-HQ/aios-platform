"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createContentItem,
  updateContentItem,
} from "@/lib/harmony/content/calendar-actions";
import {
  CONTENT_FORMATS,
  CONTENT_ITEM_STATUSES,
} from "@/lib/harmony/content/catalog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/shared/submit-button";
import { LIMITS } from "@/lib/limits";
import type { ContentItem } from "@/types/database";

type CompanyOpt = { id: string; name: string };

/** Create or edit a content calendar entry. */
export function ContentItemDialog({
  companies,
  item,
  children,
}: {
  companies: CompanyOpt[];
  item?: ContentItem;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState(item?.format ?? CONTENT_FORMATS[0]);
  const [status, setStatus] = useState(item?.status ?? "idea");
  const [companyId, setCompanyId] = useState(item?.company_id ?? "none");
  const t = useTranslations("os.content");
  const tf = useTranslations("os.contentFormat");
  const ts = useTranslations("os.contentItemStatus");
  const tc = useTranslations("common");
  const isEdit = Boolean(item);

  async function onSubmit(formData: FormData) {
    setError(null);
    const res = isEdit
      ? await updateContentItem(idleState, formData)
      : await createContentItem(idleState, formData);
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
          <DialogTitle>{isEdit ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("itemDesc")}</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          {item && <input type="hidden" name="id" value={item.id} />}
          <input type="hidden" name="company_id" value={companyId} />
          <input type="hidden" name="format" value={format} />
          <input type="hidden" name="status" value={status} />
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="content-item-title">{t("fields.title")}</Label>
            <Input
              id="content-item-title"
              name="title"
              defaultValue={item?.title ?? ""}
              maxLength={LIMITS.title}
              placeholder={t("titlePlaceholder")}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="content-item-format">{t("fields.format")}</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                <SelectTrigger id="content-item-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {tf(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-item-status">{t("fields.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="content-item-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_ITEM_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ts(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="content-item-company">{t("fields.company")}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="content-item-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noCompany")}</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-item-date">{t("fields.scheduledFor")}</Label>
              <Input
                id="content-item-date"
                name="scheduled_for"
                type="date"
                defaultValue={item?.scheduled_for ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-item-channel">{t("fields.channel")}</Label>
            <Input
              id="content-item-channel"
              name="channel"
              defaultValue={item?.channel ?? ""}
              maxLength={LIMITS.name}
              placeholder={t("channelPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-item-notes">{t("fields.notes")}</Label>
            <Textarea
              id="content-item-notes"
              name="notes"
              defaultValue={item?.notes ?? ""}
              maxLength={LIMITS.description}
              rows={3}
            />
          </div>
          <DialogFooter>
            <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
