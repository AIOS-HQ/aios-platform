import { NextResponse } from "next/server";
import { finalizeYouTubeDraft } from "@/lib/social-publishing/uploads";
import type { YouTubeDraftFinalization } from "@/lib/social-publishing/upload-contract";
import { jsonError, readJsonMetadata, requireFounderUploadContext } from "../route-utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = await requireFounderUploadContext();
    const draft = await readJsonMetadata(request) as YouTubeDraftFinalization;
    const result = await finalizeYouTubeDraft({ ...context, draft });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return jsonError(error);
  }
}
