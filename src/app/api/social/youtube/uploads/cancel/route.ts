import { NextResponse } from "next/server";
import { cancelYouTubeUpload } from "@/lib/social-publishing/uploads";
import { YouTubeUploadError } from "@/lib/social-publishing/upload-contract";
import { jsonError, readJsonMetadata, requireFounderUploadContext } from "../route-utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireFounderUploadContext();
    const metadata = await readJsonMetadata(request) as { uploadId?: unknown };
    if (typeof metadata.uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(metadata.uploadId)) {
      throw new YouTubeUploadError("invalid_request", "Upload identifier is invalid.");
    }
    await cancelYouTubeUpload({ ...context, uploadId: metadata.uploadId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
