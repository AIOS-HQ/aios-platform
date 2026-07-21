import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  YouTubeUploadError,
  assertUploadIntentOwnership,
  buildYouTubeStoragePath,
  matchesMediaSignature,
  validateYouTubeUploadMetadata,
} from "@/lib/social-publishing/upload-contract";

const requestId = "9a951b9f-3704-42bc-b0d2-da8340e999c7";

describe("YouTube direct upload security contract", () => {
  it("uses a server-owned tenant path and sanitizes client filenames", () => {
    const path = buildYouTubeStoragePath({
      userId: "user-a",
      companyId: "company-a",
      uploadId: "upload-a",
      kind: "video",
      fileName: "../../Founder launch (final).mp4",
    });
    expect(path).toBe("user-a/company-a/social/youtube/upload-a/video-..-..-Founder-launch-final-.mp4");
    expect(path).not.toContain("/​../");
  });

  it("rejects cross-user, cross-company, kind, and path substitution", () => {
    const intent = {
      user_id: "user-a",
      company_id: "company-a",
      kind: "video" as const,
      storage_path: "user-a/company-a/social/youtube/upload-a/video-launch.mp4",
    };
    expect(() => assertUploadIntentOwnership(intent, {
      userId: "user-a",
      companyId: "company-a",
      expectedKind: "video",
    })).not.toThrow();
    expect(() => assertUploadIntentOwnership(intent, {
      userId: "user-b",
      companyId: "company-a",
      expectedKind: "video",
    })).toThrow(YouTubeUploadError);
    expect(() => assertUploadIntentOwnership(intent, {
      userId: "user-a",
      companyId: "company-b",
      expectedKind: "video",
    })).toThrow(YouTubeUploadError);
    expect(() => assertUploadIntentOwnership({ ...intent, storage_path: "user-a/arbitrary.mp4" }, {
      userId: "user-a",
      companyId: "company-a",
      expectedKind: "video",
    })).toThrow(YouTubeUploadError);
  });

  it("rejects invalid MIME types, empty files, and oversized thumbnails", () => {
    expect(validateYouTubeUploadMetadata({
      clientRequestId: requestId,
      kind: "video",
      fileName: "video.exe",
      mimeType: "application/octet-stream",
      byteSize: 20 * 1024 * 1024,
    })).not.toHaveLength(0);
    expect(validateYouTubeUploadMetadata({
      clientRequestId: requestId,
      kind: "video",
      fileName: "empty.mp4",
      mimeType: "video/mp4",
      byteSize: 0,
    })).not.toHaveLength(0);
    expect(validateYouTubeUploadMetadata({
      clientRequestId: requestId,
      kind: "thumbnail",
      fileName: "large.png",
      mimeType: "image/png",
      byteSize: 3 * 1024 * 1024,
    }).join(" ")).toContain("2MB");
  });

  it("rejects MIME labels whose stored header is not the claimed media format", () => {
    const mp4 = new Uint8Array(32);
    mp4.set([0x66, 0x74, 0x79, 0x70], 4);
    expect(matchesMediaSignature("video/mp4", mp4)).toBe(true);
    expect(matchesMediaSignature("video/mp4", new Uint8Array(32))).toBe(false);
    expect(matchesMediaSignature("image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  });

  it("contains no Server Action capable of accepting YouTube video bytes", async () => {
    const [actions, page, uploader] = await Promise.all([
      readFile("src/lib/social-publishing/actions.ts", "utf8"),
      readFile("src/app/(app)/harmony/social/page.tsx", "utf8"),
      readFile("src/components/harmony/social/youtube-draft-uploader.tsx", "utf8"),
    ]);
    expect(actions).not.toContain("prepareYouTubeDraft");
    expect(actions).not.toContain("arrayBuffer()");
    expect(page).not.toContain("name=\"video\"");
    expect(page).not.toContain("action={prepareYouTubeDraft}");
    expect(uploader).toContain("uploadFileWithTus");
    expect(uploader).toContain("setState(\"failed\")");
    expect(uploader).toContain("errors.${errorCode}");
  });

  it("enforces storage verification, idempotency, immutable finalization, and worker queue state in schema", async () => {
    const [service, migration] = await Promise.all([
      readFile("src/lib/social-publishing/uploads.ts", "utf8"),
      readFile("supabase/migrations/20260721000000_youtube_resumable_uploads.sql", "utf8"),
    ]);
    expect(service.indexOf("verifyStoredObject(videoIntent)")).toBeLessThan(service.indexOf("social_media_assets"));
    expect(migration).toContain("unique (user_id, client_request_id, kind)");
    expect(migration).toContain("unique index if not exists social_media_assets_storage_path_unique");
    expect(migration).toContain("status = 'finalized'");
    expect(migration).toContain("publish_requested_at");
  });
});
