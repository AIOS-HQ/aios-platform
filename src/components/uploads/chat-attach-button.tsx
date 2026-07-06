"use client";

import { useRef, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { requestUploadTicket, resolveUploadUrl } from "@/app/(app)/settings/branding/upload-action";

const BUCKET = "aios-uploads";

/**
 * ChatAttachButton — a compact "+" that lets a user add a file or context to any
 * chat composer. Reuses the existing owner-scoped upload flow (signed ticket →
 * direct Storage upload → signed URL); adds NO backend surface. On success it
 * hands the caller a ready-to-insert context reference (filename + link) which
 * the composer appends to the message, so the attachment travels with the turn.
 */
export function ChatAttachButton({
  onAttach,
  disabled,
  accept = "image/*,application/pdf,.txt,.md,.csv,.doc,.docx",
  label = "Add file or context",
  className,
}: {
  onAttach: (reference: string, meta: { name: string; url: string }) => void;
  disabled?: boolean;
  accept?: string;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  function onFiles(files: FileList | null): void {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    start(async () => {
      try {
        const ticket = await requestUploadTicket("attachment", file.name);
        if (!ticket) return;
        const supabase = createClient();
        const { error } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(ticket.path, ticket.token, file);
        if (error) return;
        const url = (await resolveUploadUrl(ticket.path)) ?? "";
        const reference = url ? `[Attached: ${file.name}](${url})` : `[Attached: ${file.name}]`;
        onAttach(reference, { name: file.name, url });
      } catch {
        /* non-blocking: a failed attach must never break the composer */
      }
    });
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("shrink-0 text-muted-foreground", className)}
        disabled={disabled || pending}
        onClick={() => inputRef.current?.click()}
        aria-label={label}
        title={label}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
      </Button>
    </>
  );
}
