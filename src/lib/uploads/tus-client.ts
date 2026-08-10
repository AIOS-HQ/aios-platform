import { SUPABASE_TUS_CHUNK_BYTES, type YouTubeUploadAuthorization } from "@/lib/social-publishing/upload-contract";

const TUS_VERSION = "1.0.0";
const RESUME_PREFIX = "aios:youtube-tus:";
const MAX_TRANSIENT_RETRIES = 5;

export interface TusUploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface TusUploadOptions {
  file: File;
  authorization: YouTubeUploadAuthorization;
  accessToken: string;
  signal?: AbortSignal;
  onProgress?: (progress: TusUploadProgress) => void;
  fetchImpl?: typeof fetch;
}

function metadataValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function resumeKey(uploadId: string): string {
  return `${RESUME_PREFIX}${uploadId}`;
}

function savedSession(uploadId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(resumeKey(uploadId));
}

function saveSession(uploadId: string, url: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(resumeKey(uploadId), url);
}

export function clearTusResumeState(uploadId: string): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(resumeKey(uploadId));
}

function requestHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}`, "Tus-Resumable": TUS_VERSION };
}

async function createSession(options: TusUploadOptions, fetchImpl: typeof fetch): Promise<string> {
  const { file, authorization } = options;
  const uploadMetadata = [
    `bucketName ${metadataValue(authorization.bucket)}`,
    `objectName ${metadataValue(authorization.path)}`,
    `contentType ${metadataValue(file.type)}`,
    `cacheControl ${metadataValue("3600")}`,
  ].join(",");
  const response = await fetchImpl(authorization.tusEndpoint, {
    method: "POST",
    headers: {
      ...requestHeaders(options.accessToken),
      "Upload-Length": String(file.size),
      "Upload-Metadata": uploadMetadata,
      "x-upsert": "false",
    },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`tus_create_${response.status}`);
  const location = response.headers.get("location");
  if (!location) throw new Error("tus_missing_location");
  const uploadUrl = new URL(location, authorization.tusEndpoint).toString();
  saveSession(authorization.uploadId, uploadUrl);
  return uploadUrl;
}

async function readOffset(
  uploadUrl: string,
  accessToken: string,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const response = await fetchImpl(uploadUrl, {
    method: "HEAD",
    headers: requestHeaders(accessToken),
    signal,
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`tus_head_${response.status}`);
  const offset = Number(response.headers.get("upload-offset"));
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("tus_invalid_offset");
  return offset;
}

function reportProgress(options: TusUploadOptions, uploadedBytes: number): void {
  options.onProgress?.({
    uploadedBytes,
    totalBytes: options.file.size,
    percent: Math.min(100, Math.round((uploadedBytes / options.file.size) * 100)),
  });
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function delay(attempt: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, Math.min(4000, 250 * 2 ** attempt));
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Upload cancelled", "AbortError"));
    }, { once: true });
  });
}

export async function uploadFileWithTus(options: TusUploadOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!options.accessToken) throw new Error("tus_missing_access_token");
  if (options.file.size <= 0) throw new Error("tus_empty_file");
  if (new Date(options.authorization.expiresAt).getTime() <= Date.now()) throw new Error("tus_authorization_expired");

  let uploadUrl = savedSession(options.authorization.uploadId);
  let offset: number | null = null;
  if (uploadUrl) {
    offset = await readOffset(uploadUrl, options.accessToken, options.signal, fetchImpl);
    if (offset == null) {
      clearTusResumeState(options.authorization.uploadId);
      uploadUrl = null;
    }
  }
  if (!uploadUrl) {
    uploadUrl = await createSession(options, fetchImpl);
    offset = 0;
  }
  if (offset == null || offset > options.file.size) throw new Error("tus_invalid_offset");
  let currentOffset = offset;
  let activeUploadUrl = uploadUrl;
  reportProgress(options, currentOffset);

  let retries = 0;
  while (currentOffset < options.file.size) {
    if (options.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    const end = Math.min(currentOffset + SUPABASE_TUS_CHUNK_BYTES, options.file.size);
    const chunk = options.file.slice(currentOffset, end);
    try {
      const response: Response = await fetchImpl(activeUploadUrl, {
        method: "PATCH",
        headers: {
          ...requestHeaders(options.accessToken),
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(currentOffset),
        },
        body: chunk,
        signal: options.signal,
      });
      if (!response.ok) {
        if (!transientStatus(response.status)) throw new Error(`tus_patch_${response.status}`);
        throw new Error(`tus_transient_${response.status}`);
      }
      const acknowledged: number = Number(response.headers.get("upload-offset"));
      if (!Number.isSafeInteger(acknowledged) || acknowledged <= currentOffset || acknowledged > end) {
        throw new Error("tus_invalid_acknowledgement");
      }
      currentOffset = acknowledged;
      retries = 0;
      reportProgress(options, currentOffset);
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (retries >= MAX_TRANSIENT_RETRIES) throw error;
      retries += 1;
      await delay(retries, options.signal);
      const acknowledged = await readOffset(activeUploadUrl, options.accessToken, options.signal, fetchImpl);
      if (acknowledged == null) {
        clearTusResumeState(options.authorization.uploadId);
        activeUploadUrl = await createSession(options, fetchImpl);
        currentOffset = 0;
      } else {
        if (acknowledged > options.file.size) throw new Error("tus_invalid_offset");
        currentOffset = acknowledged;
      }
      reportProgress(options, currentOffset);
    }
  }
  clearTusResumeState(options.authorization.uploadId);
}
