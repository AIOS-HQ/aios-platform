export const YOUTUBE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 5;

export type YouTubeUploadResponse = { id?: string; [key: string]: unknown };

export class ExpiredYouTubeUploadSessionError extends Error {
  constructor() {
    super("The YouTube resumable upload session expired.");
    this.name = "ExpiredYouTubeUploadSessionError";
  }
}

export interface YouTubeResumableUploadOptions {
  uploadUrl: string;
  accessToken: string;
  mimeType: string;
  totalBytes: number;
  acknowledgedOffset?: number;
  verifyOffsetBeforeUpload?: boolean;
  chunkSize?: number;
  fetchImpl?: typeof fetch;
  readChunk: (start: number, endInclusive: number) => Promise<Uint8Array>;
  onAcknowledgedOffset?: (offset: number, retryCount: number) => Promise<void> | void;
  retryDelay?: (attempt: number) => Promise<void>;
}

export function parseYouTubeAcknowledgedOffset(rangeHeader: string | null): number {
  if (!rangeHeader) return 0;
  const match = /^bytes=0-(\d+)$/i.exec(rangeHeader.trim());
  if (!match) throw new Error("YouTube returned an invalid resumable upload Range header.");
  const lastByte = Number(match[1]);
  if (!Number.isSafeInteger(lastByte) || lastByte < 0) throw new Error("YouTube returned an invalid upload offset.");
  return lastByte + 1;
}

function expired(status: number): boolean {
  return status === 404 || status === 410;
}

function transient(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function jsonResponse(response: Response): Promise<YouTubeUploadResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as YouTubeUploadResponse;
  } catch {
    throw new Error("YouTube returned a malformed upload response.");
  }
}

export async function queryYouTubeUploadOffset(input: {
  uploadUrl: string;
  accessToken: string;
  totalBytes: number;
  fetchImpl?: typeof fetch;
}): Promise<{ completed: false; offset: number } | { completed: true; result: YouTubeUploadResponse }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${input.totalBytes}`,
    },
  });
  if (expired(response.status)) throw new ExpiredYouTubeUploadSessionError();
  if (response.status === 308) {
    return { completed: false, offset: parseYouTubeAcknowledgedOffset(response.headers.get("range")) };
  }
  if (response.ok) return { completed: true, result: await jsonResponse(response) };
  throw new Error(`YouTube upload status query failed (${response.status}).`);
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 250 * 2 ** attempt)));
}

export async function uploadYouTubeResumable(
  options: YouTubeResumableUploadOptions,
): Promise<YouTubeUploadResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const chunkSize = options.chunkSize ?? YOUTUBE_UPLOAD_CHUNK_BYTES;
  if (!Number.isSafeInteger(options.totalBytes) || options.totalBytes <= 0) throw new Error("YouTube upload size is invalid.");
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0 || chunkSize % (256 * 1024) !== 0) {
    throw new Error("YouTube chunks must be a positive multiple of 256 KiB.");
  }

  let offset = options.acknowledgedOffset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > options.totalBytes) throw new Error("YouTube upload offset is invalid.");
  let retries = 0;

  if (offset > 0 || options.verifyOffsetBeforeUpload) {
    const authoritative = await queryYouTubeUploadOffset({ ...options, fetchImpl });
    if (authoritative.completed) return authoritative.result;
    offset = authoritative.offset;
    await options.onAcknowledgedOffset?.(offset, retries);
  }

  while (offset < options.totalBytes) {
    const start = offset;
    const end = Math.min(start + chunkSize, options.totalBytes) - 1;
    const expectedLength = end - start + 1;
    const chunk = await options.readChunk(start, end);
    if (chunk.byteLength !== expectedLength) throw new Error("Storage returned an incomplete YouTube upload chunk.");

    try {
      const response = await fetchImpl(options.uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "Content-Type": options.mimeType,
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${start}-${end}/${options.totalBytes}`,
        },
        body: Buffer.from(chunk),
      });
      if (expired(response.status)) throw new ExpiredYouTubeUploadSessionError();
      if (response.status === 308) {
        const acknowledged = parseYouTubeAcknowledgedOffset(response.headers.get("range"));
        if (acknowledged <= start || acknowledged > end + 1) {
          throw new Error("YouTube returned a non-progressing upload offset.");
        }
        offset = acknowledged;
        retries = 0;
        await options.onAcknowledgedOffset?.(offset, retries);
        continue;
      }
      if (response.ok) {
        const result = await jsonResponse(response);
        await options.onAcknowledgedOffset?.(options.totalBytes, retries);
        return result;
      }
      if (!transient(response.status)) throw new Error(`YouTube video upload failed (${response.status}).`);
      throw new Error(`YouTube upload transient failure (${response.status}).`);
    } catch (error) {
      if (error instanceof ExpiredYouTubeUploadSessionError) throw error;
      if (retries >= MAX_RETRIES) throw error;
      retries += 1;
      await (options.retryDelay ?? retryDelay)(retries);
      const authoritative = await queryYouTubeUploadOffset({ ...options, fetchImpl });
      if (authoritative.completed) return authoritative.result;
      if (authoritative.offset < start || authoritative.offset > options.totalBytes) {
        throw new Error("YouTube returned a contradictory upload offset.");
      }
      offset = authoritative.offset;
      await options.onAcknowledgedOffset?.(offset, retries);
    }
  }

  const completed = await queryYouTubeUploadOffset({ ...options, fetchImpl });
  if (completed.completed) return completed.result;
  throw new Error("YouTube upload reached the declared size without a completion response.");
}
