"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

/** Mark a single operational issue resolved (owner-scoped). */
export async function resolveOpsEvent(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("ops_events")
    .update({ resolved: true })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/harmony/operations");
  revalidatePath("/harmony");
}

/** Mark every unresolved operational issue resolved (owner-scoped). */
export async function resolveAllOpsEvents(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("ops_events")
    .update({ resolved: true })
    .eq("user_id", user.id)
    .eq("resolved", false);
  revalidatePath("/harmony/operations");
  revalidatePath("/harmony");
}
