import { NextResponse } from "next/server";
import { rateLimitDistributed } from "@/lib/security/rate-limit";
import { authorizeYouTubeUpload } from "@/lib/social-publishing/uploads";
import { YouTubeUploadError, type YouTubeUploadMetadata } from "@/lib/social-publishing/upload-contract";
import { jsonError, readJsonMetadata, requireFounderUploadContext } from "../route-utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireFounderUploadContext();
    const limit = await rateLimitDistributed(`youtube-upload-authorize:${context.userId}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.ok) throw new YouTubeUploadError("rate_limited", "Upload authorization rate limit exceeded.", 429);
    const metadata = await readJsonMetadata(request) as YouTubeUploadMetadata;
    const authorization = await authorizeYouTubeUpload({ ...context, metadata });
    return NextResponse.json({ ok: true, authorization }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
