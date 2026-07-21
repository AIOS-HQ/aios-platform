import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "aios-uploads";

async function boundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new Error("Storage response did not include a body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error("Storage response exceeded the requested byte range.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readAssetRange(
  storagePath: string | null | undefined,
  start: number,
  endInclusive: number,
): Promise<Uint8Array> {
  if (!storagePath || storagePath.startsWith("public:")) throw new Error("YouTube media is missing a private storage path.");
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(endInclusive) || start < 0 || endInclusive < start) {
    throw new Error("Storage byte range is invalid.");
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 120);
  if (error || !data) throw new Error("Media range authorization failed.");
  const response = await fetch(data.signedUrl, {
    headers: { Range: `bytes=${start}-${endInclusive}` },
    cache: "no-store",
  });
  if (response.status !== 206) throw new Error(`Storage did not honor the requested byte range (${response.status}).`);
  const expected = endInclusive - start + 1;
  const bytes = await boundedBytes(response, expected);
  if (bytes.byteLength !== expected) throw new Error("Storage returned an incomplete byte range.");
  return bytes;
}

export async function downloadAssetBytes(storagePath: string | null | undefined): Promise<Uint8Array> {
  if (!storagePath) throw new Error("Media asset is missing a storage path.");
  if (storagePath.startsWith("public:")) {
    const relative = storagePath.slice("public:".length).replace(/^\/+/, "");
    return new Uint8Array(await readFile(join(process.cwd(), "public", relative.replace(/^public\//, ""))));
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  const { data, error } = await admin.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(error?.message || "Media asset download failed.");
  return new Uint8Array(await data.arrayBuffer());
}
