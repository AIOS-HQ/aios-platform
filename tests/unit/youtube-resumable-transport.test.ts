import { describe, expect, it, vi } from "vitest";
import {
  ExpiredYouTubeUploadSessionError,
  parseYouTubeAcknowledgedOffset,
  uploadYouTubeResumable,
} from "@/lib/social-publishing/youtube-resumable";

const MIB = 1024 * 1024;

function deterministicChunk(start: number, endInclusive: number): Uint8Array {
  const chunk = new Uint8Array(endInclusive - start + 1);
  for (let index = 0; index < chunk.length; index += 1) chunk[index] = (start + index) % 251;
  return chunk;
}

describe("YouTube resumable upload transport", () => {
  it("uses bounded chunks and follows every HTTP 308 acknowledged offset", async () => {
    const totalBytes = 18 * MIB + 137;
    const sentRanges: string[] = [];
    const chunkLengths: number[] = [];
    const offsets: number[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("content-range") ?? "";
      sentRanges.push(range);
      const body = init?.body as Uint8Array;
      chunkLengths.push(body.byteLength);
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
      if (!match) return new Response("", { status: 400 });
      const end = Number(match[2]);
      if (end + 1 < totalBytes) {
        return new Response("", { status: 308, headers: { Range: `bytes=0-${end}` } });
      }
      return Response.json({ id: "video-large" });
    });

    const result = await uploadYouTubeResumable({
      uploadUrl: "https://upload.youtube.test/session",
      accessToken: "redacted-test-token",
      mimeType: "video/mp4",
      totalBytes,
      chunkSize: 8 * MIB,
      readChunk: async (start, end) => deterministicChunk(start, end),
      onAcknowledgedOffset: (offset) => { offsets.push(offset); },
      fetchImpl,
    });

    expect(result.id).toBe("video-large");
    expect(sentRanges).toEqual([
      `bytes 0-${8 * MIB - 1}/${totalBytes}`,
      `bytes ${8 * MIB}-${16 * MIB - 1}/${totalBytes}`,
      `bytes ${16 * MIB}-${totalBytes - 1}/${totalBytes}`,
    ]);
    expect(chunkLengths).toEqual([8 * MIB, 8 * MIB, 2 * MIB + 137]);
    expect(offsets.at(-1)).toBe(totalBytes);
    expect(JSON.stringify(result)).not.toContain("redacted-test-token");
  });

  it("queries the server after a transient failure and never resends acknowledged bytes", async () => {
    const totalBytes = 20 * MIB;
    const sentRanges: string[] = [];
    let uploadCalls = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("content-range") ?? "";
      if (range.startsWith("bytes */")) {
        return new Response("", { status: 308, headers: { Range: `bytes=0-${8 * MIB - 1}` } });
      }
      sentRanges.push(range);
      uploadCalls += 1;
      if (uploadCalls === 1) return new Response("", { status: 503 });
      const end = Number(/^bytes \d+-(\d+)\//.exec(range)?.[1]);
      if (end + 1 < totalBytes) return new Response("", { status: 308, headers: { Range: `bytes=0-${end}` } });
      return Response.json({ id: "video-resumed" });
    });

    const result = await uploadYouTubeResumable({
      uploadUrl: "https://upload.youtube.test/session",
      accessToken: "token",
      mimeType: "video/mp4",
      totalBytes,
      readChunk: async (start, end) => deterministicChunk(start, end),
      fetchImpl,
      retryDelay: async () => undefined,
    });

    expect(result.id).toBe("video-resumed");
    expect(sentRanges.filter((range) => range.startsWith("bytes 0-"))).toHaveLength(1);
    expect(sentRanges[1]).toMatch(new RegExp(`^bytes ${8 * MIB}-`));
  });

  it("resumes from the server-authoritative offset after process interruption", async () => {
    const totalBytes = 16 * MIB;
    const ranges: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("content-range") ?? "";
      if (range.startsWith("bytes */")) {
        return new Response("", { status: 308, headers: { Range: `bytes=0-${8 * MIB - 1}` } });
      }
      ranges.push(range);
      return Response.json({ id: "video-recovered" });
    });

    await expect(uploadYouTubeResumable({
      uploadUrl: "https://upload.youtube.test/session",
      accessToken: "token",
      mimeType: "video/mp4",
      totalBytes,
      acknowledgedOffset: 8 * MIB,
      readChunk: async (start, end) => deterministicChunk(start, end),
      fetchImpl,
    })).resolves.toMatchObject({ id: "video-recovered" });
    expect(ranges).toEqual([`bytes ${8 * MIB}-${16 * MIB - 1}/${totalBytes}`]);
  });

  it("reports expired sessions so the adapter can safely initialize a replacement", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 410 }));
    await expect(uploadYouTubeResumable({
      uploadUrl: "https://upload.youtube.test/expired",
      accessToken: "token",
      mimeType: "video/mp4",
      totalBytes: 16 * MIB,
      acknowledgedOffset: 8 * MIB,
      readChunk: async (start, end) => deterministicChunk(start, end),
      fetchImpl,
    })).rejects.toBeInstanceOf(ExpiredYouTubeUploadSessionError);
  });

  it("parses continuation Range headers strictly", () => {
    expect(parseYouTubeAcknowledgedOffset("bytes=0-8388607")).toBe(8 * MIB);
    expect(parseYouTubeAcknowledgedOffset(null)).toBe(0);
    expect(() => parseYouTubeAcknowledgedOffset("bytes=5-10")).toThrow("invalid");
  });
});
