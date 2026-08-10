import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { resolvePrimaryCompanyId } from "@/lib/julius/wiring";
import { YouTubeUploadError } from "@/lib/social-publishing/upload-contract";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof YouTubeUploadError) {
    return NextResponse.json({ ok: false, error: { code: error.code } }, { status: error.httpStatus });
  }
  return NextResponse.json({ ok: false, error: { code: "service_unavailable" } }, { status: 500 });
}

export async function requireFounderUploadContext(): Promise<{ userId: string; companyId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new YouTubeUploadError("unauthenticated", "Authentication is required.", 401);
  if (!(await currentUserIsAdmin())) {
    throw new YouTubeUploadError("forbidden", "Founder access is required.", 403);
  }
  const companyId = await resolvePrimaryCompanyId();
  if (!companyId) throw new YouTubeUploadError("forbidden", "A Founder company is required.", 403);
  return { userId: user.id, companyId };
}

export async function readJsonMetadata(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new YouTubeUploadError("invalid_request", "Only metadata JSON is accepted.", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 32 * 1024) {
    throw new YouTubeUploadError("invalid_request", "Upload metadata is too large.", 413);
  }
  try {
    if (!request.body) throw new Error("missing body");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32 * 1024) {
        await reader.cancel();
        throw new YouTubeUploadError("invalid_request", "Upload metadata is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof YouTubeUploadError) throw error;
    throw new YouTubeUploadError("invalid_request", "Upload metadata JSON is invalid.");
  }
}
