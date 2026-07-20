"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { UploadCategory } from "@/lib/uploads/storage";
import {
  completeUpload,
  removeProfilePhoto,
  requestUploadTicket,
} from "@/app/(app)/settings/branding/upload-action";
import { validateUploadInput } from "@/lib/uploads/validation";

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
  initialPreview = null,
}: {
  category: UploadCategory;
  label: string;
  accept?: string;
  initialPreview?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<string | null>(initialPreview);
  const [fileName, setFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(file: File): Promise<void> {
    const validation = validateUploadInput({
      category,
      filename: file.name,
      mimeType: file.type,
      byteSize: file.size,
    });
    if (!validation.ok) {
      setStatus("error");
      setMessage(validation.message);
      return;
    }

    setStatus("uploading");
    setFileName(file.name);
    setMessage(null);
    const localPreview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    if (localPreview) setPreview(localPreview);
    try {
      const ticket = await requestUploadTicket(category, file.name, file.type, file.size);
      if (!ticket || ticket.error) {
        setStatus("error");
        setMessage(ticket?.error ?? "Upload could not be prepared.");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        setStatus("error");
        setMessage(error.message || "Upload failed.");
        return;
      }
      const url = await completeUpload(category, ticket.path);
      if (!url) {
        setStatus("error");
        setMessage("Upload finished, but the profile could not be saved.");
        return;
      }
      setPreview(url);
      setStatus("done");
      setMessage("Uploaded and saved.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Upload failed. Try again.");
    }
  }

  function onFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) startTransition(() => void upload(file));
  }

  const busy = pending || status === "uploading";
  const removable = category === "profile" && Boolean(preview);

  async function remove(): Promise<void> {
    if (category !== "profile") return;
    setStatus("uploading");
    setMessage(null);
    const result = await removeProfilePhoto();
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error ?? "Could not remove the profile photo.");
      return;
    }
    setPreview(null);
    setFileName(null);
    setStatus("done");
    setMessage("Profile photo removed.");
    router.refresh();
  }

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
        <div className="flex shrink-0 items-center gap-2">
          {removable ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy}
              onClick={() => startTransition(() => void remove())}
              aria-label="Remove profile photo"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
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
      </div>
      {status === "done" ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-success">
          <Check className="size-3" aria-hidden="true" /> {message ?? "Uploaded"}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
          <X className="size-3" aria-hidden="true" /> {message ?? "Upload failed. Try again."}
        </p>
      ) : null}
    </div>
  );
}
