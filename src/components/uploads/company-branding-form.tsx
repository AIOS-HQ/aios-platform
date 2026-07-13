"use client";

import { useRef, useState, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { UploadCategory } from "@/lib/uploads/storage";
import {
  requestUploadTicket,
  resolveUploadUrl,
  saveCompanyBranding,
} from "@/app/(app)/settings/branding/upload-action";
import { validateUploadInput } from "@/lib/uploads/validation";

type AssetKind = "logo" | "banner";
type Status = "idle" | "uploading" | "saving" | "saved" | "error";

const BUCKET = "aios-uploads";

interface AssetState {
  path: string | null;
  preview: string | null;
  filename: string | null;
}

function categoryFor(kind: AssetKind): UploadCategory {
  return kind === "logo" ? "company-logo" : "company-banner";
}

export function CompanyBrandingForm({
  companyId,
  companyName,
  initialLogoPath,
  initialLogoUrl,
  initialBannerPath,
  initialBannerUrl,
}: {
  companyId: string;
  companyName: string;
  initialLogoPath: string | null;
  initialLogoUrl: string | null;
  initialBannerPath: string | null;
  initialBannerUrl: string | null;
}) {
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<AssetState>({
    path: initialLogoPath,
    preview: initialLogoUrl,
    filename: null,
  });
  const [banner, setBanner] = useState<AssetState>({
    path: initialBannerPath,
    preview: initialBannerUrl,
    filename: null,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const busy = pending || status === "uploading" || status === "saving";

  async function upload(kind: AssetKind, file: File): Promise<void> {
    const category = categoryFor(kind);
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
    setMessage(null);
    const localPreview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    const setter = kind === "logo" ? setLogo : setBanner;
    if (localPreview) setter((current) => ({ ...current, preview: localPreview }));

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
      const signedUrl = await resolveUploadUrl(ticket.path);
      if (!signedUrl) {
        setStatus("error");
        setMessage("Upload finished, but the preview could not be loaded.");
        return;
      }
      setter({ path: ticket.path, preview: signedUrl, filename: file.name });
      setDirty(true);
      setStatus("idle");
      setMessage("Uploaded. Select Save Branding to persist this change.");
    } catch {
      setStatus("error");
      setMessage("Upload failed. Try again.");
    }
  }

  async function save(): Promise<void> {
    setStatus("saving");
    setMessage(null);
    const result = await saveCompanyBranding({
      companyId,
      logoPath: logo.path,
      bannerPath: banner.path,
    });
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error ?? "Could not save company branding.");
      return;
    }
    setDirty(false);
    setStatus("saved");
    setMessage("Branding saved.");
    router.refresh();
  }

  function remove(kind: AssetKind): void {
    if (kind === "logo") setLogo({ path: null, preview: null, filename: null });
    else setBanner({ path: null, preview: null, filename: null });
    setDirty(true);
    setStatus("idle");
    setMessage("Removed locally. Select Save Branding to persist this change.");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Saving writes the selected logo and banner to {companyName}&apos;s Company Context Envelope.
      </p>
      <BrandAssetField
        label="Company logo"
        description="JPG, PNG, WEBP, or GIF up to 10 MB."
        state={logo}
        inputRef={logoInputRef}
        busy={busy}
        shape="square"
        onChoose={() => logoInputRef.current?.click()}
        onRemove={() => remove("logo")}
        onFile={(file) => startTransition(() => void upload("logo", file))}
      />
      <BrandAssetField
        label="Company banner"
        description="Wide brand image, JPG, PNG, WEBP, or GIF up to 10 MB."
        state={banner}
        inputRef={bannerInputRef}
        busy={busy}
        shape="banner"
        onChoose={() => bannerInputRef.current?.click()}
        onRemove={() => remove("banner")}
        onFile={(file) => startTransition(() => void upload("banner", file))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => startTransition(() => void save())}
          disabled={busy || !dirty}
        >
          {status === "saving" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="size-4" aria-hidden="true" />
          )}
          Save Branding
        </Button>
        {message ? (
          <p className={`flex items-center gap-1 text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {status === "error" ? <X className="size-4" aria-hidden="true" /> : <Check className="size-4 text-success" aria-hidden="true" />}
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BrandAssetField({
  label,
  description,
  state,
  inputRef,
  busy,
  shape,
  onChoose,
  onRemove,
  onFile,
}: {
  label: string;
  description: string;
  state: AssetState;
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  shape: "square" | "banner";
  onChoose: () => void;
  onRemove: () => void;
  onFile: (file: File) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <div className="flex items-center gap-3">
        {state.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.preview}
            alt={label}
            className={shape === "square" ? "size-14 rounded-lg border object-cover" : "h-14 w-28 rounded-lg border object-cover"}
          />
        ) : (
          <div className={shape === "square" ? "size-14 shrink-0 rounded-lg bg-muted" : "h-14 w-28 shrink-0 rounded-lg bg-muted"} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{state.filename ?? description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.preview ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy}
              onClick={onRemove}
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onChoose}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}
