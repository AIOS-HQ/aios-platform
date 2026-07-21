import { describe, expect, it, vi } from "vitest";
import { uploadFileWithTus } from "@/lib/uploads/tus-client";
import type { YouTubeUploadAuthorization } from "@/lib/social-publishing/upload-contract";

const MIB = 1024 * 1024;

function authorization(): YouTubeUploadAuthorization {
  return {
    uploadId: "upload-1",
    bucket: "aios-uploads",
    path: "user-a/company-a/social/youtube/upload-1/video-large.mp4",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    tusEndpoint: "https://storage.test/storage/v1/upload/resumable",
  };
}

describe("browser-to-storage TUS upload", () => {
  it("uploads a generated multi-chunk file directly with progress and the server-selected path", async () => {
    const file = new File([new Uint8Array(13 * MIB + 17)], "large.mp4", { type: "video/mp4" });
    const offsets: number[] = [];
    const calls: Array<{ url: string; method: string; headers: Headers; body: BodyInit | null | undefined }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, method: init?.method ?? "GET", headers, body: init?.body });
      if (init?.method === "POST") {
        return new Response("", { status: 201, headers: { location: "/tus/session-1" } });
      }
      const start = Number(headers.get("upload-offset"));
      const size = (init?.body as Blob).size;
      return new Response(null, { status: 204, headers: { "upload-offset": String(start + size) } });
    });

    await uploadFileWithTus({
      file,
      authorization: authorization(),
      accessToken: "user-session-token",
      fetchImpl,
      onProgress: ({ uploadedBytes }) => offsets.push(uploadedBytes),
    });

    const create = calls[0];
    expect(create.method).toBe("POST");
    expect(create.headers.get("upload-length")).toBe(String(file.size));
    expect(create.headers.get("upload-metadata")).toContain("objectName");
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(3);
    expect(offsets).toEqual([0, 6 * MIB, 12 * MIB, file.size]);
    expect(JSON.stringify(calls.map((call) => Object.fromEntries(call.headers)))).not.toContain("signed-upload-secret");
  });

  it("honors cancellation without finalization or provider work", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    await expect(uploadFileWithTus({
      file: new File([new Uint8Array(7 * MIB)], "cancel.mp4", { type: "video/mp4" }),
      authorization: authorization(),
      accessToken: "user-session-token",
      signal: controller.signal,
      fetchImpl,
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});
