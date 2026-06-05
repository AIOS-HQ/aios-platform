"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/user";
import { LIMITS, exceedsLimits } from "@/lib/limits";
import { emitActivity } from "@/lib/harmony/os/events";
import {
  isContentFormat,
  isContentItemStatus,
} from "@/lib/harmony/content/catalog";
import { CONTENT_METRIC_KEYS } from "@/lib/harmony/content/insights";
import type { ActionState } from "@/lib/types";
import type { ContentItemStatus } from "@/types/database";

function orNull(v: FormDataEntryValue | null): string | null {
  const s = (v ? String(v) : "").trim();
  return s ? s : null;
}

function refOrNull(v: FormDataEntryValue | null): string | null {
  const s = orNull(v);
  return s && s !== "none" ? s : null;
}

function intOrZero(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const today = () => new Date().toISOString().slice(0, 10);

function revalidate() {
  revalidatePath("/harmony/content");
  revalidatePath("/harmony/content/calendar");
  revalidatePath("/harmony/content/analytics");
}

export async function createContentItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const to = await getTranslations("os");
  const user = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const notes = orNull(formData.get("notes"));
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (!isContentFormat(format)) {
    return { status: "error", message: t("errors.generic") };
  }
  if (exceedsLimits([[title, LIMITS.title], [notes, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const statusRaw = String(formData.get("status") ?? "idea");
  const status: ContentItemStatus = isContentItemStatus(statusRaw)
    ? statusRaw
    : "idea";
  const scheduledFor = orNull(formData.get("scheduled_for"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_items")
    .insert({
      user_id: user.id,
      company_id: refOrNull(formData.get("company_id")),
      title,
      format,
      status,
      channel: orNull(formData.get("channel")),
      notes,
      scheduled_for: scheduledFor,
      published_at: status === "published" ? scheduledFor ?? today() : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[calendar-actions] createContentItem", error);
    return { status: "error", message: t("errors.generic") };
  }

  await emitActivity({
    userId: user.id,
    companyId: refOrNull(formData.get("company_id")),
    kind: "system",
    summary: to("activity.contentItemCreated", { title }),
    refType: "content_item",
    refId: (data as { id: string }).id,
  });

  revalidate();
  return { status: "success", message: t("saved") };
}

export async function updateContentItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const notes = orNull(formData.get("notes"));
  if (!id) return { status: "error", message: t("errors.generic") };
  if (!title) return { status: "error", message: t("errors.titleRequired") };
  if (!isContentFormat(format)) {
    return { status: "error", message: t("errors.generic") };
  }
  if (exceedsLimits([[title, LIMITS.title], [notes, LIMITS.description]])) {
    return { status: "error", message: t("errors.tooLong") };
  }

  const statusRaw = String(formData.get("status") ?? "idea");
  const status: ContentItemStatus = isContentItemStatus(statusRaw)
    ? statusRaw
    : "idea";
  const scheduledFor = orNull(formData.get("scheduled_for"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("content_items")
    .update({
      title,
      format,
      status,
      channel: orNull(formData.get("channel")),
      notes,
      scheduled_for: scheduledFor,
      published_at: status === "published" ? scheduledFor ?? today() : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[calendar-actions] updateContentItem", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidate();
  return { status: "success", message: t("saved") };
}

/** Inline status change from the calendar. */
export async function setContentStatus(
  id: string,
  status: string,
): Promise<void> {
  const user = await requireUser();
  if (!id || !isContentItemStatus(status)) return;
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "published") patch.published_at = today();
  await supabase
    .from("content_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  revalidate();
}

/** Update the analytics snapshot for a content item. */
export async function setContentMetrics(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("harmony");
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: t("errors.generic") };

  const patch: Record<string, number> = {};
  for (const k of CONTENT_METRIC_KEYS) patch[k] = intOrZero(formData.get(k));

  const supabase = await createClient();
  const { error } = await supabase
    .from("content_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[calendar-actions] setContentMetrics", error);
    return { status: "error", message: t("errors.generic") };
  }

  revalidate();
  return { status: "success", message: t("saved") };
}

export async function deleteContentItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("content_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidate();
}
