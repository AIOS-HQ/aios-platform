"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { parseTags } from "@/lib/harmony/tags";
import type { ActionState } from "@/lib/types";
import type { PersonalNote } from "@/types/database";

function revalidateNotes() {
  revalidatePath("/harmony");
  revalidatePath("/harmony/notes");
}

export async function createNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title && !content) {
    return { status: "error", message: t("errors.noteEmpty") };
  }
  if (exceedsLimits([[title, LIMITS.title], [content, LIMITS.noteContent]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("personal_notes").insert({
    user_id: user.id,
    title,
    content,
    tags: parseTags(formData.get("tags")),
  });
  if (error) {
    console.error("[note-actions] db error", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateNotes();
  return { status: "success", message: t("saved") };
}

export async function updateNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!title && !content) {
    return { status: "error", message: t("errors.noteEmpty") };
  }
  if (exceedsLimits([[title, LIMITS.title], [content, LIMITS.noteContent]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_notes")
    .update({ title, content, tags: parseTags(formData.get("tags")) })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[note-actions] db error", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidateNotes();
  return { status: "success", message: t("saved") };
}

/** Pin or unpin a note. Receives the desired pinned state. */
export async function toggleNotePinned(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const pinned = String(formData.get("pinned") ?? "") === "true";
  const supabase = await createClient();
  await supabase
    .from("personal_notes")
    .update({ pinned })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateNotes();
}

export async function deleteNote(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("personal_notes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidateNotes();
}

/** Copy (or refresh) a note into the Personal Brain as a knowledge entry. */
export async function saveNoteToBrain(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("personal_notes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const note = data as PersonalNote | null;
  if (!note) return;

  // One brain entry per note: remove any prior copy, then insert fresh.
  await supabase
    .from("personal_brains")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "note")
    .eq("source_id", note.id);

  await supabase.from("personal_brains").insert({
    user_id: user.id,
    title: note.title || "Untitled note",
    content: note.content,
    kind: "note",
    source_id: note.id,
    tags: note.tags ?? [],
  });

  revalidatePath("/harmony/brain");
  revalidatePath("/harmony/notes");
}
