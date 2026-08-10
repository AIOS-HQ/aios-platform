"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, UploadCloud, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type {
  YouTubeDraftFinalization,
  YouTubeUploadAuthorization,
  YouTubeUploadErrorCode,
  YouTubeUploadMetadata,
} from "@/lib/social-publishing/upload-contract";
import { uploadFileWithTus } from "@/lib/uploads/tus-client";

type UploadState = "idle" | "preparing" | "uploading" | "verifying" | "awaiting_approval" | "cancelled" | "failed";

type Channel = { id: string; title: string; customUrl: string | null };
type Playlist = { id: string; title: string; channelId: string | null };

type ApiResponse<T> = { ok: true; result?: T; authorization?: T } | { ok: false; error?: { code?: YouTubeUploadErrorCode } };

const SAFE_ERROR_CODES: readonly YouTubeUploadErrorCode[] = [
  "unauthenticated",
  "forbidden",
  "rate_limited",
  "invalid_request",
  "invalid_metadata",
  "upload_expired",
  "upload_not_found",
  "verification_in_progress",
  "storage_incomplete",
  "storage_mismatch",
  "provider_validation",
  "service_unavailable",
];

function requestKey(file: File): string {
  return `aios:youtube-draft:${file.name}:${file.size}:${file.lastModified}`;
}

function requestIdFor(file: File): string {
  const key = requestKey(file);
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

function clearRequestId(file: File | null): void {
  if (file) window.localStorage.removeItem(requestKey(file));
}

async function videoMetadata(file: File): Promise<{ durationSeconds: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const element = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const finish = (value: { durationSeconds: number | null; width: number | null; height: number | null }) => {
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };
    element.preload = "metadata";
    element.onloadedmetadata = () => finish({
      durationSeconds: Number.isFinite(element.duration) ? element.duration : null,
      width: element.videoWidth || null,
      height: element.videoHeight || null,
    });
    element.onerror = () => finish({ durationSeconds: null, width: null, height: null });
    element.src = objectUrl;
  });
}

async function postMetadata<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({ ok: false })) as ApiResponse<T>;
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.ok ? "service_unavailable" : payload.error?.code ?? "service_unavailable");
    error.name = "YouTubeUploadError";
    throw error;
  }
  const value = payload.authorization ?? payload.result;
  if (!value) throw new Error("service_unavailable");
  return value;
}

export function YouTubeDraftUploader({
  channels,
  playlists,
  disabled,
}: {
  channels: Channel[];
  playlists: Playlist[];
  disabled: boolean;
}) {
  const t = useTranslations("socialPublishing.youtubeUpload");
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const authorizationIds = useRef<string[]>([]);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorCode, setErrorCode] = useState<YouTubeUploadErrorCode | "cancelled" | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = state === "preparing" || state === "uploading" || state === "verifying";

  async function authorize(
    clientRequestId: string,
    file: File,
    kind: "video" | "thumbnail",
    metadata: Awaited<ReturnType<typeof videoMetadata>>,
    altText?: string,
  ): Promise<YouTubeUploadAuthorization> {
    const body: YouTubeUploadMetadata = {
      clientRequestId,
      kind,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      durationSeconds: kind === "video" ? metadata.durationSeconds : null,
      width: kind === "video" ? metadata.width : null,
      height: kind === "video" ? metadata.height : null,
      altText: kind === "thumbnail" ? altText : null,
    };
    return postMetadata<YouTubeUploadAuthorization>("/api/social/youtube/uploads/authorize", body, abortRef.current?.signal);
  }

  async function cancel(): Promise<void> {
    abortRef.current?.abort();
    const ids = [...authorizationIds.current];
    authorizationIds.current = [];
    await Promise.allSettled(ids.map((uploadId) => fetch("/api/social/youtube/uploads/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    })));
    clearRequestId(video);
    setState("cancelled");
    setErrorCode("cancelled");
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!video || busy) return;
    const form = new FormData(event.currentTarget);
    const controller = new AbortController();
    abortRef.current = controller;
    authorizationIds.current = [];
    setErrorCode(null);
    setProgress(0);
    setState("preparing");
    try {
      const clientRequestId = requestIdFor(video);
      const metadata = await videoMetadata(video);
      const [videoAuthorization, thumbnailAuthorization] = await Promise.all([
        authorize(clientRequestId, video, "video", metadata),
        thumbnail
          ? authorize(clientRequestId, thumbnail, "thumbnail", { durationSeconds: null, width: null, height: null }, String(form.get("thumbnail_alt") ?? ""))
          : Promise.resolve(null),
      ]);
      authorizationIds.current = [videoAuthorization.uploadId, ...(thumbnailAuthorization ? [thumbnailAuthorization.uploadId] : [])];
      const supabase = createClient();
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("unauthenticated");

      setState("uploading");
      const videoWeight = thumbnail ? 90 : 100;
      await uploadFileWithTus({
        file: video,
        authorization: videoAuthorization,
        accessToken,
        signal: controller.signal,
        onProgress: ({ percent }) => setProgress(Math.round(percent * videoWeight / 100)),
      });
      if (thumbnail && thumbnailAuthorization) {
        await uploadFileWithTus({
          file: thumbnail,
          authorization: thumbnailAuthorization,
          accessToken,
          signal: controller.signal,
          onProgress: ({ percent }) => setProgress(videoWeight + Math.round(percent * (100 - videoWeight) / 100)),
        });
      }

      setState("verifying");
      const rawTags = String(form.get("youtube_tags") ?? "");
      const finalization: YouTubeDraftFinalization = {
        clientRequestId,
        videoUploadId: videoAuthorization.uploadId,
        thumbnailUploadId: thumbnailAuthorization?.uploadId ?? null,
        contentType: form.get("content_type") === "youtube_short" ? "youtube_short" : "youtube_video",
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        channelId: String(form.get("youtube_channel_id") ?? ""),
        visibility: ["private", "unlisted", "public"].includes(String(form.get("youtube_visibility")))
          ? String(form.get("youtube_visibility")) as YouTubeDraftFinalization["visibility"]
          : "private",
        tags: rawTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        playlistId: String(form.get("youtube_playlist_id") ?? "") || null,
        scheduledAt: String(form.get("scheduled_at") ?? "") || null,
      };
      await postMetadata("/api/social/youtube/uploads/finalize", finalization, controller.signal);
      setProgress(100);
      setState("awaiting_approval");
      authorizationIds.current = [];
      clearRequestId(video);
      router.refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      const rawCode = error instanceof Error ? error.message : "service_unavailable";
      const code: YouTubeUploadErrorCode = SAFE_ERROR_CODES.includes(rawCode as YouTubeUploadErrorCode)
        ? rawCode as YouTubeUploadErrorCode
        : "service_unavailable";
      if (["upload_expired", "upload_not_found", "storage_mismatch"].includes(code)) clearRequestId(video);
      setErrorCode(code);
      setState("failed");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="youtube-content-type">{t("format")}</Label>
          <select id="youtube-content-type" name="content_type" disabled={disabled || busy} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="youtube_video">{t("video")}</option>
            <option value="youtube_short">{t("short")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="youtube-channel">{t("channel")}</Label>
          <select id="youtube-channel" name="youtube_channel_id" disabled={disabled || busy} required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">{t("selectChannel")}</option>
            {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="youtube-title">{t("title")}</Label>
        <Input id="youtube-title" name="title" disabled={disabled || busy} required maxLength={100} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="youtube-description">{t("description")}</Label>
        <Textarea id="youtube-description" name="description" disabled={disabled || busy} required rows={4} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="youtube-visibility">{t("visibility")}</Label>
          <select id="youtube-visibility" name="youtube_visibility" defaultValue="private" disabled={disabled || busy} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="private">{t("private")}</option>
            <option value="unlisted">{t("unlisted")}</option>
            <option value="public">{t("public")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="youtube-scheduled-at">{t("scheduledAt")}</Label>
          <Input id="youtube-scheduled-at" name="scheduled_at" type="datetime-local" disabled={disabled || busy} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="youtube-playlist">{t("playlist")}</Label>
        <select id="youtube-playlist" name="youtube_playlist_id" disabled={disabled || busy} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">{t("noPlaylist")}</option>
          {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.title}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="youtube-tags">{t("tags")}</Label>
        <Input id="youtube-tags" name="youtube_tags" disabled={disabled || busy} placeholder={t("tagsPlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="youtube-video">{t("videoFile")}</Label>
        <Input id="youtube-video" type="file" accept="video/mp4,video/quicktime,video/webm" disabled={disabled || busy} required onChange={(event) => setVideo(event.target.files?.[0] ?? null)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="youtube-thumbnail">{t("thumbnail")}</Label>
          <Input id="youtube-thumbnail" type="file" accept="image/jpeg,image/png" disabled={disabled || busy} onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="youtube-thumbnail-alt">{t("thumbnailAlt")}</Label>
          <Input id="youtube-thumbnail-alt" name="thumbnail_alt" disabled={disabled || busy || !thumbnail} />
        </div>
      </div>

      {state !== "idle" ? (
        <div className="space-y-2 rounded-md border bg-background/70 p-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UploadCloud className="size-4" aria-hidden="true" />}
              {t(`states.${state}`)}
            </span>
            {state === "uploading" ? <span className="tabular-nums">{progress}%</span> : null}
          </div>
          {state === "uploading" ? <Progress value={progress} aria-label={t("uploadProgress", { progress })} /> : null}
          {errorCode ? <p className="text-sm text-destructive">{t(`errors.${errorCode}`)}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={disabled || busy || !video}>
          {state === "failed" ? t("retry") : t("prepareDraft")}
        </Button>
        {busy ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void cancel()}>
            <X className="size-4" aria-hidden="true" /> {t("cancel")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t("directUploadNote")}</p>
    </form>
  );
}
