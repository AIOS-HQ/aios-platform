"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { UploadCategory } from "@/lib/uploads/storage";
import { requestUploadTicket, resolveUploadUrl } from "@/app/(app)/settings/branding/upload-action";

/**
 * UploadButton (P6) — "+" attachment/upload control with drag-and-drop,
 * clipboard paste, preview, and an uploading state. Requests an owner-scoped
 * signed ticket from the server, uploads directly to Storage, then shows a
 * signed preview. Accepts images/PDFs by default.
 */

type Status = "idle" | "uploading" | "done" | "error";

const BUCKET = "aios-uploads";

export function UploadButton({
  category,
  label,
  accept = "image/*,application/pdf",
}: {
  category: UploadCategory;
  label: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(file: File): Promise<void> {
    setStatus("uploading");
    setFileName(file.name);
    try {
      const ticket = await requestUploadTicket(category, file.name);
      if (!ticket) {
        setStatus("error");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        setStatus("error");
        return;
      }
      const url = await resolveUploadUrl(ticket.path);
      setPreview(url);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  function onFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) startTransition(() => void upload(file));
  }

  const busy = pending || status === "uploading";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      onPaste={(e) => onFiles(e.clipboardData?.files ?? null)}
      className={`rounded-xl border border-dashed p-4 transition ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="size-14 rounded-lg border object-cover" />
        ) : (
          <div className="size-14 shrink-0 rounded-lg bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {fileName ?? "Drag & drop, paste, or choose a file"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          Upload
        </Button>
      </div>
      {status === "done" ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-success">
          <Check className="size-3" aria-hidden="true" /> Uploaded
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
          <X className="size-3" aria-hidden="true" /> Upload failed — try again
        </p>
      ) : null}
    </div>
  );
}
