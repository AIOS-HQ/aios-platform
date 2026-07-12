import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";

export async function downloadAssetBytes(storagePath: string | null | undefined): Promise<Uint8Array> {
  if (!storagePath) throw new Error("Media asset is missing a storage path.");
  if (storagePath.startsWith("public:")) {
    const relative = storagePath.slice("public:".length).replace(/^\/+/, "");
    return new Uint8Array(await readFile(join(process.cwd(), "public", relative.replace(/^public\//, ""))));
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin client unavailable.");
  const { data, error } = await admin.storage.from("aios-uploads").download(storagePath);
  if (error || !data) throw new Error(error?.message || "Media asset download failed.");
  return new Uint8Array(await data.arrayBuffer());
}
