import { describe, expect, it } from "vitest";
import {
  PROFILE_PHOTO_MAX_BYTES,
  validateUploadInput,
} from "@/lib/uploads/validation";

describe("profile photo upload validation", () => {
  it("accepts supported profile image uploads under the size limit", () => {
    expect(
      validateUploadInput({
        category: "profile",
        filename: "founder.webp",
        mimeType: "image/webp",
        byteSize: PROFILE_PHOTO_MAX_BYTES,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects unsupported profile photo file types", () => {
    const result = validateUploadInput({
      category: "profile",
      filename: "avatar.svg",
      mimeType: "image/svg+xml",
      byteSize: 1024,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: expect.stringContaining("JPG") });
  });

  it("rejects oversized profile photos", () => {
    const result = validateUploadInput({
      category: "profile",
      filename: "avatar.png",
      mimeType: "image/png",
      byteSize: PROFILE_PHOTO_MAX_BYTES + 1,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: expect.stringContaining("5 MB") });
  });

  it("rejects path traversal in upload filenames", () => {
    const result = validateUploadInput({
      category: "profile",
      filename: "../avatar.png",
      mimeType: "image/png",
      byteSize: 1024,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: expect.stringContaining("path") });
  });
});
