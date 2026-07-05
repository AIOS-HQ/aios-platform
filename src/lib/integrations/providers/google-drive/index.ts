import "server-only";

import { registerCapabilityHandler } from "@/lib/integrations/runtime/runtime";
import { driveFetch, driveUploadMedia } from "./client";

/** Google Drive capabilities: list_files (read); upload_file (routine); delete_file (destructive). */
interface UploadFileInput {
  content: string;
  mimeType?: string;
}
interface FileRef {
  fileId: string;
}

function requireToken(token: string | null): string {
  if (!token) throw new Error("Missing Google access token");
  return token;
}

let registered = false;

export function registerGoogleDriveCapabilities(): void {
  if (registered) return;
  registered = true;

  registerCapabilityHandler("google_drive", "list_files", async ({ accessToken }) =>
    driveFetch(requireToken(accessToken), { path: "/files?pageSize=100&fields=files(id,name,mimeType,modifiedTime)" }),
  );
  registerCapabilityHandler<UploadFileInput, unknown>("google_drive", "upload_file", async ({ accessToken, input }) =>
    driveUploadMedia(requireToken(accessToken), input.content, input.mimeType ?? "text/plain"),
  );
  registerCapabilityHandler<FileRef, unknown>("google_drive", "delete_file", async ({ accessToken, input }) =>
    driveFetch(requireToken(accessToken), { method: "DELETE", path: `/files/${input.fileId}` }),
  );
}
