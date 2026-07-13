export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const PROFILE_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; message: string };

function extensionFor(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function validateUploadInput(input: {
  category: string;
  filename: string;
  mimeType?: string | null;
  byteSize?: number | null;
}): UploadValidationResult {
  if (input.filename.includes("/") || input.filename.includes("\\")) {
    return { ok: false, message: "File name cannot include path separators." };
  }

  if (input.category === "profile") {
    const ext = extensionFor(input.filename);
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return { ok: false, message: "Profile photos must be JPG, PNG, WEBP, or GIF images." };
    }
    if (input.mimeType && !PROFILE_PHOTO_MIME_TYPES.has(input.mimeType)) {
      return { ok: false, message: "Profile photos must be JPG, PNG, WEBP, or GIF images." };
    }
    if (typeof input.byteSize === "number" && input.byteSize > PROFILE_PHOTO_MAX_BYTES) {
      return { ok: false, message: "Profile photos must be 5 MB or smaller." };
    }
  }

  return { ok: true };
}
